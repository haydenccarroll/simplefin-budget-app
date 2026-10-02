# A CPU-only Ollama with the categorization model baked in, for running on
# hosts that scale to zero (Azure Container Apps): a cold start pulls this one
# image and needs nothing else, instead of the ~5 GB official image (mostly GPU
# libraries) plus a model download.
#
#   docker build -t sfba-ollama --build-arg MODEL=qwen2.5:3b deploy/ollama
ARG OLLAMA_VERSION=0.35.0

FROM ollama/ollama:${OLLAMA_VERSION} AS ollama
# Keep only the CPU backends.
RUN rm -rf /usr/lib/ollama/cuda_* /usr/lib/ollama/mlx_* /usr/lib/ollama/vulkan /usr/lib/ollama/include

FROM ubuntu:24.04 AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=ollama /usr/bin/ollama /usr/bin/ollama
COPY --from=ollama /usr/lib/ollama /usr/lib/ollama
ENV OLLAMA_HOST=0.0.0.0:11434 \
    OLLAMA_MODELS=/models

# Download the model at build time.
FROM base AS model
ARG MODEL=qwen2.5:3b
RUN ollama serve & pid=$!; \
    until ollama list >/dev/null 2>&1; do sleep 1; done; \
    ollama pull "$MODEL" && kill $pid

FROM base
ARG MODEL=qwen2.5:3b
COPY --from=model /models /models
# One request at a time, and keep the model in memory for as long as the
# container lives (the host stops the container when it is idle).
ENV OLLAMA_NUM_PARALLEL=1 \
    OLLAMA_MAX_LOADED_MODELS=1 \
    OLLAMA_KEEP_ALIVE=-1 \
    MODEL=${MODEL}
EXPOSE 11434
ENTRYPOINT ["/usr/bin/ollama"]
CMD ["serve"]
