/*!
PayGate NextHub — gRPC Service Implementation
=============================================
Implements the tonic-generated SettlementService trait.
All methods delegate to the SettlementEngine in settlement.rs.
*/

use std::sync::Arc;

use tonic::{Request, Response, Status};
use tracing::{error, info, instrument};
use uuid::Uuid;

use crate::proto::settlement_service_server::SettlementService;
use crate::proto::*;
use crate::settlement::{SettlementEngine, TigerBeetleClient};
use crate::error::SettlementError;

pub struct SettlementServiceImpl {
    engine: Option<Arc<SettlementEngine>>,
}

impl SettlementServiceImpl {
    pub fn new(tb_client: Arc<Option<TigerBeetleClient>>) -> Self {
        let engine = tb_client.as_ref().as_ref().map(|client| {
            Arc::new(SettlementEngine::new(client.clone()))
        });
        Self { engine }
    }

    fn require_engine(&self) -> Result<&SettlementEngine, Status> {
        self.engine
            .as_deref()
            .ok_or_else(|| Status::unavailable("TigerBeetle connection not available"))
    }
}

fn settlement_err_to_status(e: SettlementError) -> Status {
    match e {
        SettlementError::InsufficientFunds => Status::failed_precondition("Insufficient funds"),
        SettlementError::TransferNotFound(id) => Status::not_found(format!("Transfer not found: {id}")),
        SettlementError::AlreadyCommitted(id) => Status::already_exists(format!("Already committed: {id}")),
        SettlementError::AlreadyAborted(id) => Status::already_exists(format!("Already aborted: {id}")),
        SettlementError::Expired(id) => Status::deadline_exceeded(format!("Transfer expired: {id}")),
        SettlementError::DfspNotFound(id) => Status::not_found(format!("DFSP not found: {id}")),
        SettlementError::TigerBeetle(msg) => Status::internal(format!("TigerBeetle error: {msg}")),
        SettlementError::InvalidInput(msg) => Status::invalid_argument(msg),
    }
}

#[tonic::async_trait]
impl SettlementService for SettlementServiceImpl {
    // ── Prepare Transfer ──────────────────────────────────────────────────────

    #[instrument(skip(self, request), fields(transfer_id = %request.get_ref().transfer_id))]
    async fn prepare_transfer(
        &self,
        request: Request<PrepareTransferRequest>,
    ) -> Result<Response<PrepareTransferResponse>, Status> {
        let req = request.into_inner();
        info!("prepare_transfer: {} {} {} {}", req.transfer_id, req.payer_dfsp_id, req.payee_dfsp_id, req.amount_minor);

        let engine = self.require_engine()?;
        match engine.prepare(&req.transfer_id, &req.payer_dfsp_id, &req.payee_dfsp_id,
                              req.amount_minor, &req.currency, &req.ilp_condition, req.expiry_ms).await {
            Ok(position_after) => Ok(Response::new(PrepareTransferResponse {
                transfer_id: req.transfer_id,
                status: "PREPARED".to_string(),
                payer_position_after: position_after,
                error_message: String::new(),
            })),
            Err(SettlementError::InsufficientFunds) => Ok(Response::new(PrepareTransferResponse {
                transfer_id: req.transfer_id,
                status: "INSUFFICIENT_FUNDS".to_string(),
                payer_position_after: 0,
                error_message: "Payer DFSP position insufficient".to_string(),
            })),
            Err(e) => {
                error!("prepare_transfer failed: {:?}", e);
                Ok(Response::new(PrepareTransferResponse {
                    transfer_id: req.transfer_id,
                    status: "ERROR".to_string(),
                    payer_position_after: 0,
                    error_message: e.to_string(),
                }))
            }
        }
    }

    // ── Fulfil Transfer ───────────────────────────────────────────────────────

    #[instrument(skip(self, request), fields(transfer_id = %request.get_ref().transfer_id))]
    async fn fulfil_transfer(
        &self,
        request: Request<FulfilTransferRequest>,
    ) -> Result<Response<FulfilTransferResponse>, Status> {
        let req = request.into_inner();
        info!("fulfil_transfer: {}", req.transfer_id);

        let engine = self.require_engine()?;
        match engine.fulfil(&req.transfer_id, &req.ilp_fulfillment).await {
            Ok(committed_at_ms) => Ok(Response::new(FulfilTransferResponse {
                transfer_id: req.transfer_id,
                status: "COMMITTED".to_string(),
                committed_at_ms,
                error_message: String::new(),
            })),
            Err(SettlementError::AlreadyCommitted(id)) => Ok(Response::new(FulfilTransferResponse {
                transfer_id: id,
                status: "ALREADY_COMMITTED".to_string(),
                committed_at_ms: 0,
                error_message: String::new(),
            })),
            Err(SettlementError::Expired(id)) => Ok(Response::new(FulfilTransferResponse {
                transfer_id: id,
                status: "EXPIRED".to_string(),
                committed_at_ms: 0,
                error_message: "Transfer has expired".to_string(),
            })),
            Err(SettlementError::TransferNotFound(id)) => Ok(Response::new(FulfilTransferResponse {
                transfer_id: id,
                status: "NOT_FOUND".to_string(),
                committed_at_ms: 0,
                error_message: "Transfer not found".to_string(),
            })),
            Err(e) => {
                error!("fulfil_transfer failed: {:?}", e);
                Ok(Response::new(FulfilTransferResponse {
                    transfer_id: req.transfer_id,
                    status: "ERROR".to_string(),
                    committed_at_ms: 0,
                    error_message: e.to_string(),
                }))
            }
        }
    }

    // ── Abort Transfer ────────────────────────────────────────────────────────

    #[instrument(skip(self, request), fields(transfer_id = %request.get_ref().transfer_id))]
    async fn abort_transfer(
        &self,
        request: Request<AbortTransferRequest>,
    ) -> Result<Response<AbortTransferResponse>, Status> {
        let req = request.into_inner();
        info!("abort_transfer: {} code={}", req.transfer_id, req.error_code);

        let engine = self.require_engine()?;
        match engine.abort(&req.transfer_id, &req.error_code, &req.error_description).await {
            Ok(()) => Ok(Response::new(AbortTransferResponse {
                transfer_id: req.transfer_id,
                status: "ABORTED".to_string(),
                error_message: String::new(),
            })),
            Err(SettlementError::AlreadyAborted(id)) => Ok(Response::new(AbortTransferResponse {
                transfer_id: id,
                status: "ALREADY_ABORTED".to_string(),
                error_message: String::new(),
            })),
            Err(SettlementError::TransferNotFound(id)) => Ok(Response::new(AbortTransferResponse {
                transfer_id: id,
                status: "NOT_FOUND".to_string(),
                error_message: "Transfer not found".to_string(),
            })),
            Err(e) => {
                error!("abort_transfer failed: {:?}", e);
                Ok(Response::new(AbortTransferResponse {
                    transfer_id: req.transfer_id,
                    status: "ERROR".to_string(),
                    error_message: e.to_string(),
                }))
            }
        }
    }

    // ── Cross-Currency Transfer ───────────────────────────────────────────────

    #[instrument(skip(self, request), fields(transfer_id = %request.get_ref().transfer_id))]
    async fn cross_currency_transfer(
        &self,
        request: Request<CrossCurrencyRequest>,
    ) -> Result<Response<CrossCurrencyResponse>, Status> {
        let req = request.into_inner();
        info!("cross_currency_transfer: {} {} {}→{}", req.transfer_id,
              req.payer_dfsp_id, req.payer_currency, req.payee_currency);

        let engine = self.require_engine()?;
        match engine.cross_currency(
            &req.transfer_id,
            &req.payer_dfsp_id,
            &req.payee_dfsp_id,
            req.payer_amount_minor,
            &req.payer_currency,
            req.payee_amount_minor,
            &req.payee_currency,
            &req.fx_rate_id,
            req.expiry_ms,
        ).await {
            Ok(()) => Ok(Response::new(CrossCurrencyResponse {
                transfer_id: req.transfer_id,
                status: "PREPARED".to_string(),
                error_message: String::new(),
            })),
            Err(e) => Ok(Response::new(CrossCurrencyResponse {
                transfer_id: req.transfer_id,
                status: "ERROR".to_string(),
                error_message: e.to_string(),
            })),
        }
    }

    // ── DFSP Provisioning ─────────────────────────────────────────────────────

    async fn provision_dfsp_accounts(
        &self,
        request: Request<ProvisionDfspRequest>,
    ) -> Result<Response<ProvisionDfspResponse>, Status> {
        let req = request.into_inner();
        info!("provision_dfsp_accounts: {} currencies={:?}", req.dfsp_id, req.currencies);

        let engine = self.require_engine()?;
        match engine.provision_dfsp(
            &req.dfsp_id,
            &req.nip_code,
            &req.currencies,
            req.initial_position_minor,
            req.liquidity_threshold_minor,
        ).await {
            Ok(accounts) => Ok(Response::new(ProvisionDfspResponse {
                dfsp_id: req.dfsp_id,
                accounts: accounts.into_iter().map(|a| AccountInfo {
                    account_id: a.id,
                    account_type: a.account_type,
                    currency: a.currency,
                    balance_minor: a.balance,
                }).collect(),
                status: "PROVISIONED".to_string(),
            })),
            Err(e) => Err(settlement_err_to_status(e)),
        }
    }

    // ── DFSP Balance ──────────────────────────────────────────────────────────

    async fn get_dfsp_balance(
        &self,
        request: Request<GetDfspBalanceRequest>,
    ) -> Result<Response<GetDfspBalanceResponse>, Status> {
        let req = request.into_inner();
        let engine = self.require_engine()?;
        match engine.get_balance(&req.dfsp_id, &req.currency).await {
            Ok(bal) => Ok(Response::new(GetDfspBalanceResponse {
                dfsp_id: req.dfsp_id,
                currency: req.currency,
                position_minor: bal.position,
                settlement_minor: bal.settlement,
                liquidity_threshold_minor: bal.threshold,
                below_threshold: bal.position < bal.threshold,
            })),
            Err(e) => Err(settlement_err_to_status(e)),
        }
    }

    // ── Settlement Window ─────────────────────────────────────────────────────

    async fn close_settlement_window(
        &self,
        request: Request<CloseWindowRequest>,
    ) -> Result<Response<CloseWindowResponse>, Status> {
        let req = request.into_inner();
        info!("close_settlement_window: {} type={}", req.window_id, req.window_type);

        let engine = self.require_engine()?;
        match engine.close_window(&req.window_id, &req.window_type).await {
            Ok(positions) => Ok(Response::new(CloseWindowResponse {
                window_id: req.window_id,
                status: "CLOSED".to_string(),
                net_positions: positions.into_iter().map(|p| NetPosition {
                    dfsp_id: p.dfsp_id,
                    currency: p.currency,
                    net_minor: p.net_minor,
                    settlement_status: p.status,
                }).collect(),
            })),
            Err(e) => Err(settlement_err_to_status(e)),
        }
    }

    async fn get_net_positions(
        &self,
        request: Request<GetNetPositionsRequest>,
    ) -> Result<Response<GetNetPositionsResponse>, Status> {
        let req = request.into_inner();
        let engine = self.require_engine()?;
        match engine.get_net_positions(&req.window_id).await {
            Ok(positions) => Ok(Response::new(GetNetPositionsResponse {
                window_id: req.window_id,
                positions: positions.into_iter().map(|p| NetPosition {
                    dfsp_id: p.dfsp_id,
                    currency: p.currency,
                    net_minor: p.net_minor,
                    settlement_status: p.status,
                }).collect(),
            })),
            Err(e) => Err(settlement_err_to_status(e)),
        }
    }

    // ── Invoice Transfer ──────────────────────────────────────────────────────

    async fn post_invoice_transfer(
        &self,
        request: Request<PostInvoiceRequest>,
    ) -> Result<Response<PostInvoiceResponse>, Status> {
        let req = request.into_inner();
        info!("post_invoice_transfer: {} dfsp={} amount={}", req.transfer_id, req.dfsp_id, req.amount_minor);

        let engine = self.require_engine()?;
        match engine.post_invoice(
            &req.transfer_id, &req.dfsp_id, req.amount_minor, &req.currency, &req.invoice_id,
        ).await {
            Ok(()) => Ok(Response::new(PostInvoiceResponse {
                transfer_id: req.transfer_id,
                status: "POSTED".to_string(),
                error_message: String::new(),
            })),
            Err(e) => Ok(Response::new(PostInvoiceResponse {
                transfer_id: req.transfer_id,
                status: "ERROR".to_string(),
                error_message: e.to_string(),
            })),
        }
    }

    // ── Fee Transfer ──────────────────────────────────────────────────────────

    async fn post_fee_transfer(
        &self,
        request: Request<PostFeeRequest>,
    ) -> Result<Response<PostFeeResponse>, Status> {
        let req = request.into_inner();
        let engine = self.require_engine()?;
        match engine.post_fee(
            &req.transfer_id, &req.dfsp_id, &req.fee_type, req.amount_minor, &req.currency,
        ).await {
            Ok(fee_transfer_id) => Ok(Response::new(PostFeeResponse {
                fee_transfer_id,
                status: "POSTED".to_string(),
                error_message: String::new(),
            })),
            Err(e) => Ok(Response::new(PostFeeResponse {
                fee_transfer_id: String::new(),
                status: "ERROR".to_string(),
                error_message: e.to_string(),
            })),
        }
    }
}
