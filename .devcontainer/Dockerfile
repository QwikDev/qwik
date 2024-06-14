FROM cimg/rust:1.73-node

RUN rustup --version; \
    cargo --version; \
    rustc --version; 

RUN rustup update; \
    rustup target add wasm32-unknown-unknown; \
    cargo install cargo-insta --locked; \
    cargo install wasm-pack --locked; \
    rustup component add clippy; \
    corepack enable --install-directory ~/bin

RUN mkdir /home/circleci/store; \
    pnpm config set store-dir /home/circleci/store
