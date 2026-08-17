# DeepSeek Harness for VS Code — task automation
# Tokens are read from the environment only (already exported in ~/.zshrc);
# this file stores no secrets. Every recipe that uses a token starts with @
# so the command line (and the token value) is never echoed to the terminal.

SHELL := /bin/bash
NPM := npm --cache .npm-cache
VERSION ?= $(shell node -p "require('./package.json').version")
VSIX ?= $(shell node -p "require('./package.json').name")-$(VERSION).vsix

.PHONY: help install compile watch test package publish publish-vscode publish-ovsx namespace tag clean

help: ## List all tasks
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-16s %s\n", $$1, $$2}'

install: ## Install dependencies (cached into .npm-cache)
	$(NPM) install

compile: ## Compile TypeScript (tsc strict)
	$(NPM) run compile

watch: ## Watch and recompile
	$(NPM) run watch

test: ## Run unit tests (compiles first; node:test)
	$(NPM) test

package: compile ## Build the vsix (README/LICENSE/nls/icon included)
	$(NPM) run package

# -- Publishing (tokens from env vars; fail loudly when missing) ------------

publish: package publish-vscode publish-ovsx ## Publish to both channels (Marketplace + Open VSX)

publish-vscode: package ## Publish to VS Code Marketplace (needs VSCE_PAT or a prior `vsce login`)
	@if [ -n "$$VSCE_PAT" ]; then \
		npx --no-install vsce publish --packagePath $(VSIX) --pat "$$VSCE_PAT"; \
	else \
		npx --no-install vsce publish --packagePath $(VSIX); \
	fi

publish-ovsx: package ## Publish to Open VSX (needs OVSX_TOKEN, exported in ~/.zshrc)
	@test -n "$$OVSX_TOKEN" || { echo "Error: OVSX_TOKEN is not set (see doc/publishing.md)"; exit 1; }
	@npx --yes ovsx publish $(VSIX) -p "$$OVSX_TOKEN"

namespace: ## Create the Open VSX namespace (needs OVSX_TOKEN)
	@test -n "$$OVSX_TOKEN" || { echo "Error: OVSX_TOKEN is not set"; exit 1; }
	@npx --yes ovsx create-namespace floatinghotpot -p "$$OVSX_TOKEN"

tag: ## Create git tag v<version> (does not push)
	git tag v$(VERSION)

clean: ## Remove build artifacts (vsix / out)
	rm -f *.vsix
	rm -rf out
