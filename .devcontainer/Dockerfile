FROM cimg/rust:1.65.0-node

RUN rustup --version; \
    cargo --version; \
    rustc --version; \
    rustup update; \
    rustup target add wasm32-unknown-unknown; \
    cargo install cargo-insta; \
    rustup component add clippy; \
    corepack enable --install-directory ~/bin
