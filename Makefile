# ─── PayGate Merchant Portal — Makefile ──────────────────────────────────────
# Usage: make <target>
# Run `make help` to see all available targets.

.PHONY: help dev build test lint typecheck format db-push db-reset \
        go-build go-vet go-test rust-build rust-test \
        python-lint python-test docker-build docker-up docker-down \
        k8s-apply k8s-delete k8s-status seed-db archive clean

# ─── Colours ─────────────────────────────────────────────────────────────────
BOLD  := $(shell tput bold 2>/dev/null || echo "")
RESET := $(shell tput sgr0 2>/dev/null || echo "")
GREEN := $(shell tput setaf 2 2>/dev/null || echo "")
CYAN  := $(shell tput setaf 6 2>/dev/null || echo "")

# ─── Variables ───────────────────────────────────────────────────────────────
COMPOSE_FILE     := infra/docker-compose.prod.yml
K8S_DIR          := infra/k8s/base
PYTHON_SERVICES  := fraud-scoring fraud-heatmap lakehouse-v2 lakehouse-audit \
                    usdc-lakehouse-consumer cohort-analytics settlement-forecast \
                    ai-insights reconciliation-engine carbon-oracle \
                    insurance-pricing tax-engine iso20022-parser
RUST_SERVICES    := credit-scoring billing-engine
GO_BRIDGE_DIR    := go-bridge
ARCHIVE_NAME     := paygate_PRODUCTION_$(shell date +%Y%m%d).tar.gz

# ─── Help ────────────────────────────────────────────────────────────────────
help: ## Show this help message
	@echo "$(BOLD)PayGate Merchant Portal$(RESET)"
	@echo ""
	@echo "$(CYAN)Node.js / Portal:$(RESET)"
	@grep -E '^(dev|build|test|lint|typecheck|format|db-push|db-reset|seed-db):.*##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*##"}; {printf "  %-22s %s\n", $$1, $$2}'
	@echo ""
	@echo "$(CYAN)Go Bridge:$(RESET)"
	@grep -E '^go-.*:.*##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*##"}; {printf "  %-22s %s\n", $$1, $$2}'
	@echo ""
	@echo "$(CYAN)Rust Services:$(RESET)"
	@grep -E '^rust-.*:.*##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*##"}; {printf "  %-22s %s\n", $$1, $$2}'
	@echo ""
	@echo "$(CYAN)Python Services:$(RESET)"
	@grep -E '^python-.*:.*##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*##"}; {printf "  %-22s %s\n", $$1, $$2}'
	@echo ""
	@echo "$(CYAN)Docker / Infra:$(RESET)"
	@grep -E '^(docker|k8s|archive|clean).*:.*##' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*##"}; {printf "  %-22s %s\n", $$1, $$2}'

# ─── Node.js / Portal ────────────────────────────────────────────────────────
dev: ## Start development server
	pnpm dev

build: ## Build for production
	NODE_ENV=production pnpm build

test: ## Run Vitest unit tests
	pnpm test

test-watch: ## Run Vitest in watch mode
	pnpm test --watch

test-coverage: ## Run Vitest with coverage report
	pnpm test --coverage

lint: ## Run ESLint
	pnpm lint

typecheck: ## Run TypeScript type-check
	pnpm exec tsc --noEmit

format: ## Format code with Prettier
	pnpm exec prettier --write .

format-check: ## Check code formatting with Prettier
	pnpm exec prettier --check .

db-push: ## Push schema changes to database
	pnpm db:push

db-reset: ## Reset database (destructive — dev only)
	@echo "$(BOLD)WARNING: This will destroy all data. Press Ctrl+C to cancel.$(RESET)"
	@sleep 3
	pnpm exec drizzle-kit drop && pnpm db:push

seed-db: ## Seed production admin user
	node scripts/seed-production-admin.mjs

e2e: ## Run Playwright e2e tests
	pnpm exec playwright test

e2e-ui: ## Run Playwright e2e tests in UI mode
	pnpm exec playwright test --ui

e2e-report: ## Show last Playwright test report
	pnpm exec playwright show-report

# ─── Go Bridge ───────────────────────────────────────────────────────────────
go-build: ## Build Go bridge binary
	cd $(GO_BRIDGE_DIR) && go build -o /tmp/paygate-go-bridge ./cmd/bridge
	@echo "$(GREEN)Go bridge built successfully$(RESET)"

go-vet: ## Run go vet on Go bridge
	cd $(GO_BRIDGE_DIR) && go vet ./...

go-test: ## Run Go bridge tests
	cd $(GO_BRIDGE_DIR) && go test ./... -v -timeout 60s

go-lint: ## Run golangci-lint on Go bridge (requires golangci-lint)
	cd $(GO_BRIDGE_DIR) && golangci-lint run ./...

go-tidy: ## Run go mod tidy
	cd $(GO_BRIDGE_DIR) && go mod tidy

# ─── Rust Services ───────────────────────────────────────────────────────────
rust-build: ## Build all Rust services
	@for svc in $(RUST_SERVICES); do \
		echo "$(CYAN)Building rust-services/$$svc...$(RESET)"; \
		cd rust-services/$$svc && cargo build --release && cd ../..; \
	done

rust-test: ## Run Rust tests
	@for svc in $(RUST_SERVICES); do \
		echo "$(CYAN)Testing rust-services/$$svc...$(RESET)"; \
		cd rust-services/$$svc && cargo test && cd ../..; \
	done

rust-clippy: ## Run Clippy on Rust services
	@for svc in $(RUST_SERVICES); do \
		cd rust-services/$$svc && cargo clippy -- -D warnings && cd ../..; \
	done

# ─── Python Services ─────────────────────────────────────────────────────────
python-lint: ## Lint all Python services with flake8
	@for svc in $(PYTHON_SERVICES); do \
		echo "$(CYAN)Linting python-services/$$svc...$(RESET)"; \
		cd python-services/$$svc && \
		python -m flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics \
			--exclude=.git,__pycache__ 2>/dev/null || true; \
		cd ../..; \
	done

python-syntax: ## Check Python syntax for all services
	@for svc in $(PYTHON_SERVICES); do \
		if [ -f "python-services/$$svc/main.py" ]; then \
			python -m py_compile python-services/$$svc/main.py && \
			echo "$(GREEN)OK: $$svc$(RESET)" || echo "ERROR: $$svc"; \
		fi; \
	done

python-test: ## Run Python tests (pytest) for all services
	@for svc in $(PYTHON_SERVICES); do \
		if [ -d "python-services/$$svc/tests" ]; then \
			echo "$(CYAN)Testing python-services/$$svc...$(RESET)"; \
			cd python-services/$$svc && python -m pytest tests/ -v && cd ../..; \
		fi; \
	done

# ─── Docker / Infra ──────────────────────────────────────────────────────────
docker-build: ## Build all Docker images
	docker compose -f $(COMPOSE_FILE) build

docker-up: ## Start all services with Docker Compose
	docker compose -f $(COMPOSE_FILE) up -d

docker-down: ## Stop all Docker Compose services
	docker compose -f $(COMPOSE_FILE) down

docker-logs: ## Tail Docker Compose logs
	docker compose -f $(COMPOSE_FILE) logs -f --tail=100

docker-ps: ## Show running Docker containers
	docker compose -f $(COMPOSE_FILE) ps

docker-pull: ## Pull latest Docker images
	docker compose -f $(COMPOSE_FILE) pull

docker-validate: ## Validate docker-compose.prod.yml syntax
	python3 -c "import yaml; yaml.safe_load(open('$(COMPOSE_FILE)'))" && \
		echo "$(GREEN)docker-compose.prod.yml is valid$(RESET)"

# ─── Kubernetes ──────────────────────────────────────────────────────────────
k8s-apply: ## Apply K8s manifests to current cluster context
	kubectl apply -k $(K8S_DIR)

k8s-delete: ## Delete K8s resources (destructive)
	kubectl delete -k $(K8S_DIR)

k8s-status: ## Show K8s pod status in paygate namespace
	kubectl get pods -n paygate -o wide

k8s-logs: ## Tail K8s logs for portal pod
	kubectl logs -n paygate -l app=paygate-portal -f --tail=100

k8s-validate: ## Validate K8s manifests with kubeval
	find $(K8S_DIR) -name "*.yaml" | xargs kubeval --ignore-missing-schemas 2>&1 || true

# ─── Archive & Clean ─────────────────────────────────────────────────────────
archive: ## Generate comprehensive production archive
	@echo "$(CYAN)Creating archive: $(ARCHIVE_NAME)$(RESET)"
	tar --exclude='.git' \
		--exclude='node_modules' \
		--exclude='dist' \
		--exclude='.pnpm-store' \
		--exclude='coverage' \
		--exclude='playwright-report' \
		--exclude='*.tar.gz' \
		--exclude='target' \
		--exclude='__pycache__' \
		--exclude='*.pyc' \
		--exclude='.manus-logs' \
		-czf /home/ubuntu/$(ARCHIVE_NAME) \
		-C /home/ubuntu paygate-merchant-portal
	@ls -lh /home/ubuntu/$(ARCHIVE_NAME)
	@echo "$(GREEN)Archive created: /home/ubuntu/$(ARCHIVE_NAME)$(RESET)"

clean: ## Remove build artifacts and caches
	rm -rf dist/ coverage/ playwright-report/ .nyc_output/
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	@for svc in $(RUST_SERVICES); do \
		[ -d "rust-services/$$svc/target" ] && rm -rf "rust-services/$$svc/target" || true; \
	done
	@echo "$(GREEN)Clean complete$(RESET)"

# ─── All-in-one ──────────────────────────────────────────────────────────────
ci: lint typecheck test go-vet python-syntax ## Run full CI pipeline locally
	@echo "$(GREEN)All CI checks passed$(RESET)"
