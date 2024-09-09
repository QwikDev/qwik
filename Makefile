install-rust:
	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

install-rust-deps:
	rustup update
	rustup target add wasm32-unknown-unknown
	cargo install cargo-insta
	rustup component add clippy

add-target:
	rustup target add wasm32-unknown-unknown

install-all: install-rust install-rust-deps

install-cli:
	cd src/optimizer/cli && cargo install --path .

fix:
	cargo fmt

check:
	cargo fmt -- --check && cargo check --all-features

lint:
	cargo clippy --all-features && cargo check --all-features && cargo fmt -- --check

# We only test core because there are no other tests and qwik-napi breaks the build
test:
	cargo test --manifest-path packages/qwik/src/optimizer/core/Cargo.toml

test-update:
	if ! cargo test --manifest-path packages/qwik/src/optimizer/core/Cargo.toml; then \
		cd packages/qwik/src/optimizer/core/src/snapshots/; \
		for i in *.new; do f=$$(basename $$i .new); mv $$i $$f; done; \
		cd -; \
		cargo test --manifest-path packages/qwik/src/optimizer/core/Cargo.toml; \
	fi

publish-core:
	cd src/optimizer/core && cargo publish --all-features

publish-cli:
	cd src/optimizer/cli && cargo publish

publish: publish-core publish-cli

validate: check lint test
