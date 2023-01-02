dev:
    cd ./frontend && npm run start
pack:
    wasm-pack build ./node-manager --dev --target web

pack-mac:
    AR=/opt/homebrew/opt/llvm/bin/llvm-ar CC=/opt/homebrew/opt/llvm/bin/clang wasm-pack build ./node-manager --dev --target web

test:
    cargo test --package ln-websocket-proxy --all-features --bins --lib
    wasm-pack test --headless --chrome ./node-manager

test-mac:
    cargo test --package ln-websocket-proxy --all-features --bins --lib
    AR=/opt/homebrew/opt/llvm/bin/llvm-ar CC=/opt/homebrew/opt/llvm/bin/clang wasm-pack test --headless --chrome ./node-manager

cert:
    mkdir -p ./frontend/.cert && mkcert -key-file ./frontend/.cert/key.pem -cert-file ./frontend/.cert/cert.pem "localhost"

proxy:
    cargo run -p ln-websocket-proxy --features="server"

clippy:
    cargo clippy --package ln-websocket-proxy --all-features
    cargo clippy --package node-manager -- -Aclippy::drop_non_drop

clippy-mac:
    cargo clippy --package ln-websocket-proxy --all-features
    cd ./node-manager && AR=/opt/homebrew/opt/llvm/bin/llvm-ar CC=/opt/homebrew/opt/llvm/bin/clang cargo clippy --package node-manager -- -Aclippy::drop_non_drop

