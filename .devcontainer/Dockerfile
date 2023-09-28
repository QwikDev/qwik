FROM cimg/rust:1.72.1-node

RUN rustup --version; \
    cargo --version; \
    rustc --version; 

RUN rustup update; \
    rustup target add wasm32-unknown-unknown; \
    cargo install cargo-insta; \
    cargo install wasm-pack; \
    rustup component add clippy; \
    corepack enable --install-directory ~/bin