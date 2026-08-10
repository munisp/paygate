"""Pydantic models for Mojaloop FSPIOP events."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TransferCompletedEvent(BaseModel):
    event_type: str = "mojaloop.transfer.completed"
    merchant_id: str
    transfer_id: str
    quote_id: str
    transfer_state: str  # COMMITTED | RESERVED
    fulfilment: Optional[str] = None
    amount: str
    currency: str
    payer_fsp_id: str
    payee_fsp_id: str
    timestamp: datetime


class TransferFailedEvent(BaseModel):
    event_type: str = "mojaloop.transfer.failed"
    merchant_id: str
    transfer_id: str
    quote_id: str
    error_code: str
    error_description: str
    timestamp: datetime


class PartyFoundEvent(BaseModel):
    event_type: str = "mojaloop.party.found"
    merchant_id: str
    party_id_type: str
    party_identifier: str
    fsp_id: str
    party_name: Optional[str] = None
    timestamp: datetime


class QuoteAcceptedEvent(BaseModel):
    event_type: str = "mojaloop.quote.accepted"
    merchant_id: str
    quote_id: str
    transfer_amount: str
    currency: str
    ilp_packet: str
    condition: str
    expiration: str
    timestamp: datetime
