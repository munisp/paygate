// Package fsm implements the NextHub Transfer Finite State Machine.
//
// State transitions follow the FSPIOP API v2.0 specification:
//
//	RECEIVED → RESERVED → COMMITTED
//	RECEIVED → ABORTED
//	RESERVED → ABORTED
//
// Each transition publishes a Fluvio event and calls the TigerBeetle
// settlement service via gRPC.
package fsm

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// TransferState represents the lifecycle state of an FSPIOP transfer.
type TransferState string

const (
	StateReceived  TransferState = "RECEIVED"
	StateReserved  TransferState = "RESERVED"
	StateCommitted TransferState = "COMMITTED"
	StateAborted   TransferState = "ABORTED"
)

// TransferEvent represents an FSPIOP lifecycle event.
type TransferEvent string

const (
	EventPrepare TransferEvent = "PREPARE"
	EventFulfil  TransferEvent = "FULFIL"
	EventAbort   TransferEvent = "ABORT"
	EventTimeout TransferEvent = "TIMEOUT"
)

// Transfer holds the in-memory state of a single FSPIOP transfer.
type Transfer struct {
	ID                   string
	State                TransferState
	PayerFSPID           string
	PayeeFSPID           string
	AmountCurrency       string
	AmountValue          string // decimal string, e.g. "100.00"
	ILPPacket            string
	Condition            string
	Fulfilment           string
	ExpirationTime       time.Time
	TigerBeetlePendingID uint128 // set on PREPARE, used for POST/VOID
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// uint128 is a placeholder for TigerBeetle's 128-bit transfer ID.
// In production, use tigerbeetle-go's ID type.
type uint128 struct {
	Lo uint64
	Hi uint64
}

// FSMError is returned when a state transition is invalid.
type FSMError struct {
	TransferID string
	From       TransferState
	Event      TransferEvent
	Msg        string
}

func (e *FSMError) Error() string {
	return fmt.Sprintf("fsm: transfer %s: invalid transition %s -[%s]-> : %s",
		e.TransferID, e.From, e.Event, e.Msg)
}

// SettlementClient is the interface the FSM uses to call TigerBeetle.
// The concrete implementation lives in the nexthub-settlement Rust gRPC server.
type SettlementClient interface {
	Prepare(ctx context.Context, t *Transfer) (pendingID uint128, err error)
	Fulfil(ctx context.Context, t *Transfer) error
	Abort(ctx context.Context, t *Transfer) error
}

// EventPublisher publishes Fluvio events for async DFSP callbacks.
type EventPublisher interface {
	PublishPrepareResult(ctx context.Context, t *Transfer, err error) error
	PublishFulfilResult(ctx context.Context, t *Transfer, err error) error
	PublishAbortResult(ctx context.Context, t *Transfer, err error) error
}

// TransferFSM manages the lifecycle of a single FSPIOP transfer.
type TransferFSM struct {
	transfer   *Transfer
	settlement SettlementClient
	publisher  EventPublisher
	tracer     trace.Tracer
}

// NewTransferFSM creates a new FSM for the given transfer.
func NewTransferFSM(t *Transfer, s SettlementClient, p EventPublisher) *TransferFSM {
	return &TransferFSM{
		transfer:   t,
		settlement: s,
		publisher:  p,
		tracer:     otel.Tracer("nexthub/fsm"),
	}
}

// Prepare transitions RECEIVED → RESERVED.
// It calls TigerBeetle to post a PENDING linked transfer chain
// (position debit + fee reserve) atomically.
func (fsm *TransferFSM) Prepare(ctx context.Context) error {
	ctx, span := fsm.tracer.Start(ctx, "TransferFSM.Prepare",
		trace.WithAttributes(
			attribute.String("transfer.id", fsm.transfer.ID),
			attribute.String("payer.fsp", fsm.transfer.PayerFSPID),
			attribute.String("payee.fsp", fsm.transfer.PayeeFSPID),
			attribute.String("amount.currency", fsm.transfer.AmountCurrency),
			attribute.String("amount.value", fsm.transfer.AmountValue),
		),
	)
	defer span.End()

	if fsm.transfer.State != StateReceived {
		return &FSMError{
			TransferID: fsm.transfer.ID,
			From:       fsm.transfer.State,
			Event:      EventPrepare,
			Msg:        "transfer must be in RECEIVED state to PREPARE",
		}
	}

	// Check expiration before touching TigerBeetle.
	if time.Now().After(fsm.transfer.ExpirationTime) {
		_ = fsm.publisher.PublishAbortResult(ctx, fsm.transfer,
			errors.New("transfer expired before PREPARE"))
		fsm.transfer.State = StateAborted
		fsm.transfer.UpdatedAt = time.Now()
		return fmt.Errorf("transfer %s expired at %s", fsm.transfer.ID, fsm.transfer.ExpirationTime)
	}

	// Post PENDING linked transfers to TigerBeetle.
	pendingID, err := fsm.settlement.Prepare(ctx, fsm.transfer)
	if err != nil {
		span.RecordError(err)
		_ = fsm.publisher.PublishPrepareResult(ctx, fsm.transfer, err)
		return fmt.Errorf("settlement.Prepare: %w", err)
	}

	fsm.transfer.TigerBeetlePendingID = pendingID
	fsm.transfer.State = StateReserved
	fsm.transfer.UpdatedAt = time.Now()

	span.SetAttributes(
		attribute.String("tigerbeetle.pending_id.lo", fmt.Sprintf("%d", pendingID.Lo)),
		attribute.String("tigerbeetle.pending_id.hi", fmt.Sprintf("%d", pendingID.Hi)),
	)

	return fsm.publisher.PublishPrepareResult(ctx, fsm.transfer, nil)
}

// Fulfil transitions RESERVED → COMMITTED.
// It calls TigerBeetle to POST_PENDING_TRANSFER, committing both
// the main transfer and the fee reserve atomically.
func (fsm *TransferFSM) Fulfil(ctx context.Context, fulfilment string) error {
	ctx, span := fsm.tracer.Start(ctx, "TransferFSM.Fulfil",
		trace.WithAttributes(
			attribute.String("transfer.id", fsm.transfer.ID),
			attribute.String("fulfilment", fulfilment),
		),
	)
	defer span.End()

	if fsm.transfer.State != StateReserved {
		return &FSMError{
			TransferID: fsm.transfer.ID,
			From:       fsm.transfer.State,
			Event:      EventFulfil,
			Msg:        "transfer must be in RESERVED state to FULFIL",
		}
	}

	// Validate ILP fulfilment against condition.
	if err := validateFulfilment(fsm.transfer.Condition, fulfilment); err != nil {
		return fmt.Errorf("invalid fulfilment: %w", err)
	}

	fsm.transfer.Fulfilment = fulfilment

	if err := fsm.settlement.Fulfil(ctx, fsm.transfer); err != nil {
		span.RecordError(err)
		_ = fsm.publisher.PublishFulfilResult(ctx, fsm.transfer, err)
		return fmt.Errorf("settlement.Fulfil: %w", err)
	}

	fsm.transfer.State = StateCommitted
	fsm.transfer.UpdatedAt = time.Now()

	return fsm.publisher.PublishFulfilResult(ctx, fsm.transfer, nil)
}

// Abort transitions RECEIVED|RESERVED → ABORTED.
// For RESERVED transfers it calls TigerBeetle VOID_PENDING_TRANSFER
// to atomically restore the payer's position.
func (fsm *TransferFSM) Abort(ctx context.Context, errorCode string) error {
	ctx, span := fsm.tracer.Start(ctx, "TransferFSM.Abort",
		trace.WithAttributes(
			attribute.String("transfer.id", fsm.transfer.ID),
			attribute.String("error.code", errorCode),
		),
	)
	defer span.End()

	switch fsm.transfer.State {
	case StateReceived:
		// No TigerBeetle entry yet — just mark aborted.
		fsm.transfer.State = StateAborted
		fsm.transfer.UpdatedAt = time.Now()
		return fsm.publisher.PublishAbortResult(ctx, fsm.transfer, nil)

	case StateReserved:
		if err := fsm.settlement.Abort(ctx, fsm.transfer); err != nil {
			span.RecordError(err)
			_ = fsm.publisher.PublishAbortResult(ctx, fsm.transfer, err)
			return fmt.Errorf("settlement.Abort: %w", err)
		}
		fsm.transfer.State = StateAborted
		fsm.transfer.UpdatedAt = time.Now()
		return fsm.publisher.PublishAbortResult(ctx, fsm.transfer, nil)

	default:
		return &FSMError{
			TransferID: fsm.transfer.ID,
			From:       fsm.transfer.State,
			Event:      EventAbort,
			Msg:        "cannot abort a COMMITTED or already ABORTED transfer",
		}
	}
}

// NewTransfer creates a new Transfer with a generated UUID and RECEIVED state.
func NewTransfer(
	payerFSP, payeeFSP, currency, amount, ilpPacket, condition string,
	expiration time.Time,
) *Transfer {
	return &Transfer{
		ID:               uuid.New().String(),
		State:            StateReceived,
		PayerFSPID:       payerFSP,
		PayeeFSPID:       payeeFSP,
		AmountCurrency:   currency,
		AmountValue:      amount,
		ILPPacket:        ilpPacket,
		Condition:        condition,
		ExpirationTime:   expiration,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}
}

// decodeBase64URL decodes a base64url-encoded value, accepting both the
// unpadded (RFC 4648 §5, as used by Mojaloop/ILP) and padded variants.
func decodeBase64URL(s string) ([]byte, error) {
	if b, err := base64.RawURLEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.URLEncoding.DecodeString(s)
}

// validateFulfilment implements the Mojaloop FSPIOP fulfilment check:
// a fulfilment is valid iff base64url(SHA-256(fulfilment)) equals the
// transfer's condition, where the condition is the base64url encoding of
// a 32-byte SHA-256 digest. It fails closed: malformed base64url input,
// a non-32-byte condition, or any digest mismatch is rejected.
func validateFulfilment(condition, fulfilment string) error {
	if fulfilment == "" {
		return errors.New("fulfilment must not be empty")
	}
	if condition == "" {
		return errors.New("condition must not be empty")
	}

	condBytes, err := decodeBase64URL(condition)
	if err != nil {
		return fmt.Errorf("condition is not valid base64url: %w", err)
	}
	if len(condBytes) != sha256.Size {
		return fmt.Errorf("condition must decode to a %d-byte SHA-256 digest, got %d bytes", sha256.Size, len(condBytes))
	}

	fulfilBytes, err := decodeBase64URL(fulfilment)
	if err != nil {
		return fmt.Errorf("fulfilment is not valid base64url: %w", err)
	}

	digest := sha256.Sum256(fulfilBytes)
	if !bytes.Equal(digest[:], condBytes) {
		return errors.New("fulfilment does not satisfy the transfer condition (SHA-256 mismatch)")
	}
	return nil
}
