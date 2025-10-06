FROM rustlang/rust:nightly-slim

RUN apt-get update && apt-get install -y git pkg-config libssl-dev curl make && rm -rf /var/lib/apt/lists/*

# Clone the C2PA repository and build c2patool
RUN git clone https://github.com/contentauth/c2pa-rs.git /c2pa-rs
WORKDIR /c2pa-rs
RUN cargo build --release && cp target/release/c2patool /usr/local/bin/c2patool

# Minimal runtime workspace used when mounting the project directory.
WORKDIR /app

# Note: keys, certs, trust bundle, and manifest are mounted from host at runtime via -v.
CMD ["bash", "-lc", "cd /app && bash run.sh"]
