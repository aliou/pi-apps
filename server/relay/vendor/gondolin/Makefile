.PHONY: build typecheck lint test format clean fuzz

PNPM ?= pnpm
RUN_PARALLEL ?= ../scripts/run-parallel

# Host fuzzer target name (see host/fuzz/targets)
TARGET ?= virtio

build:
	@$(PNPM) run build

typecheck:
	@$(PNPM) exec tsc -p tsconfig.json --noEmit

lint: typecheck

format:
	@echo "No formatter configured for host"

test:
	@$(RUN_PARALLEL) -j 1 \
		"host:test" "$(PNPM) run test"

fuzz:
	@$(PNPM) run fuzz -- $(TARGET)

clean:
	@rm -rf dist
