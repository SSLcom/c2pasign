FROM rustlang/rust:nightly-slim

ARG APP_REPO_URL="https://github.com/contentauth/c2pasign.git"

RUN apt-get update && apt-get install -y git pkg-config libssl-dev curl make nodejs npm && rm -rf /var/lib/apt/lists/*

# Clone the C2PA repository and build c2patool
RUN git clone https://github.com/contentauth/c2pa-rs.git /c2pa-rs
WORKDIR /c2pa-rs
RUN cargo build --release && cp target/release/c2patool /usr/local/bin/c2patool

# Copy the application source if it is present in the build context; otherwise
# fall back to cloning it from the configured repository URL. This makes the
# image build succeed even when the deploy target only has the Docker assets.
WORKDIR /tmp/context
COPY . .

RUN if [ -f run.sh ]; then \
      rm -rf /app && mkdir -p /app && cp -a . /app; \
    else \
      echo "run.sh not found in build context; cloning ${APP_REPO_URL}" && \
      rm -rf /app && git clone --depth=1 "${APP_REPO_URL}" /app; \
    fi

RUN rm -rf /tmp/context

WORKDIR /app

RUN chmod +x run.sh

# Note: keys, certs, trust bundle, and manifest can be mounted from the host at runtime if needed.
