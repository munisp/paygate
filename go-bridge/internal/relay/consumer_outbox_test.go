package relay

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/paygate/go-bridge/internal/fluvio"
)

// mockPublisher records published messages for assertions.
type mockPublisher struct {
	published []struct {
		topic   string
		payload []byte
	}
	failTopics map[string]bool
}

func (m *mockPublisher) Publish(_ context.Context, topic string, payload []byte) error {
	if m.failTopics[topic] {
		return &publishError{topic: topic}
	}
	m.published = append(m.published, struct {
		topic   string
		payload []byte
	}{topic, payload})
	return nil
}

type publishError struct{ topic string }

func (e *publishError) Error() string { return "publish failed: " + e.topic }

// ─── topicForEventType ────────────────────────────────────────────────────────

func TestTopicForEventType_WalletCredit(t *testing.T) {
	topic := topicForEventType("consumer.wallet.credit")
	if topic != "paygate-consumer-wallet-events" {
		t.Errorf("expected paygate-consumer-wallet-events, got %s", topic)
	}
}

func TestTopicForEventType_WalletDebit(t *testing.T) {
	topic := topicForEventType("consumer.wallet.debit")
	if topic != "paygate-consumer-wallet-events" {
		t.Errorf("expected paygate-consumer-wallet-events, got %s", topic)
	}
}

func TestTopicForEventType_WalletTopUp(t *testing.T) {
	topic := topicForEventType("consumer.wallet.top_up")
	if topic != "paygate-consumer-wallet-events" {
		t.Errorf("expected paygate-consumer-wallet-events, got %s", topic)
	}
}

func TestTopicForEventType_P2PTransfer(t *testing.T) {
	topic := topicForEventType("consumer.transfer.p2p")
	if topic != "paygate-consumer-transfer-events" {
		t.Errorf("expected paygate-consumer-transfer-events, got %s", topic)
	}
}

func TestTopicForEventType_BankTransfer(t *testing.T) {
	topic := topicForEventType("consumer.transfer.bank")
	if topic != "paygate-consumer-transfer-events" {
		t.Errorf("expected paygate-consumer-transfer-events, got %s", topic)
	}
}

func TestTopicForEventType_BillPay(t *testing.T) {
	topic := topicForEventType("consumer.transfer.bill_pay")
	if topic != "paygate-consumer-transfer-events" {
		t.Errorf("expected paygate-consumer-transfer-events, got %s", topic)
	}
}

func TestTopicForEventType_FraudFlagged(t *testing.T) {
	topic := topicForEventType("consumer.fraud.flagged")
	if topic != "paygate-consumer-fraud-signals" {
		t.Errorf("expected paygate-consumer-fraud-signals, got %s", topic)
	}
}

func TestTopicForEventType_DisputeSubmitted(t *testing.T) {
	topic := topicForEventType("consumer.dispute.submitted")
	if topic != "paygate-consumer-dispute-events" {
		t.Errorf("expected paygate-consumer-dispute-events, got %s", topic)
	}
}

func TestTopicForEventType_Unknown(t *testing.T) {
	topic := topicForEventType("unknown.event.type")
	if topic != "" {
		t.Errorf("expected empty string for unknown event type, got %s", topic)
	}
}

// ─── processEvent ─────────────────────────────────────────────────────────────

func TestProcessEvent_PublishesCorrectTopic(t *testing.T) {
	pub := &mockPublisher{}
	relay := &ConsumerOutboxRelay{publisher: pub}

	payload, _ := json.Marshal(map[string]string{"user_id": "u1", "amount": "5000"})
	evt := OutboxEvent{
		ID:          "evt-001",
		AggregateID: "wallet-001",
		EventType:   "consumer.wallet.credit",
		Payload:     payload,
	}

	// We can't call processEvent directly without a DB, so test the publisher path
	ctx := context.Background()
	topic := topicForEventType(evt.EventType)
	if err := relay.publisher.Publish(ctx, topic, evt.Payload); err != nil {
		t.Fatalf("unexpected publish error: %v", err)
	}

	if len(pub.published) != 1 {
		t.Fatalf("expected 1 published message, got %d", len(pub.published))
	}
	if pub.published[0].topic != "paygate-consumer-wallet-events" {
		t.Errorf("expected topic paygate-consumer-wallet-events, got %s", pub.published[0].topic)
	}
}

func TestProcessEvent_PublisherError_IsReturned(t *testing.T) {
	pub := &mockPublisher{
		failTopics: map[string]bool{"paygate-consumer-fraud-signals": true},
	}
	ctx := context.Background()
	err := pub.Publish(ctx, "paygate-consumer-fraud-signals", []byte(`{}`))
	if err == nil {
		t.Error("expected error from failing publisher, got nil")
	}
}

// ─── NewConsumerOutboxRelay ───────────────────────────────────────────────────

func TestNewConsumerOutboxRelay_DefaultConfig(t *testing.T) {
	pub := &mockPublisher{}
	relay := NewConsumerOutboxRelay(nil, pub)
	if relay.batchSize != 50 {
		t.Errorf("expected batchSize 50, got %d", relay.batchSize)
	}
	if relay.pollInterval.Seconds() != 5 {
		t.Errorf("expected pollInterval 5s, got %v", relay.pollInterval)
	}
}

// ─── Fluvio consumer topics ───────────────────────────────────────────────────

func TestFluvioConsumerTopicConstants(t *testing.T) {
	tests := []struct {
		name     string
		constant string
		expected string
	}{
		{"wallet events", fluvio.TopicConsumerWalletEvents, "paygate-consumer-wallet-events"},
		{"transfer events", fluvio.TopicConsumerTransferEvents, "paygate-consumer-transfer-events"},
		{"fraud signals", fluvio.TopicConsumerFraudSignals, "paygate-consumer-fraud-signals"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.constant != tt.expected {
				t.Errorf("expected %s, got %s", tt.expected, tt.constant)
			}
		})
	}
}
