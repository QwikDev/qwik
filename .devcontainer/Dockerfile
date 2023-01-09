FROM cimg/rust:1.65.0-node

RUN rustup toolchain install nightly-2022-09-23; \
    rustup default nightly-2022-09-23; \
    rustup --version; \
    cargo --version; \
    rustc --version; \
    rustup update; \
    rustup target add wasm32-unknown-unknown; \
    cargo install cargo-insta wasm-pack; \
    rustup component add clippy; \
    corepack enable --install-directory ~/bin
