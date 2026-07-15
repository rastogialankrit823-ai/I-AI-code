# Attribution

I&AI Code builds on the following pretrained models, libraries, and tools.

## Pretrained model

| | License | Use |
|---|---|---|
| [Qwen2.5-Coder-3B-Instruct](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF) (Alibaba Cloud / Qwen team) | Qwen Research License | The model behind every AI feature; GGUF quantization published by the Qwen team |

## Inference runtime

| | License | Use |
|---|---|---|
| [llama.cpp](https://github.com/ggml-org/llama.cpp) (Georgi Gerganov & contributors) | MIT | On-device inference server with Metal/CUDA/CPU backends and OpenAI-compatible API |

## Backend (Python)

| | License | Use |
|---|---|---|
| [FastAPI](https://github.com/fastapi/fastapi) | MIT | HTTP API framework |
| [Uvicorn](https://github.com/encode/uvicorn) | BSD-3 | ASGI server |
| [Pydantic](https://github.com/pydantic/pydantic) | MIT | Request/response validation |
| [Requests](https://github.com/psf/requests) | Apache-2.0 | HTTP client to llama.cpp |

## Frontend / desktop

| | License | Use |
|---|---|---|
| [React](https://github.com/facebook/react) | MIT | UI |
| [Vite](https://github.com/vitejs/vite) | MIT | Build tool / dev server |
| [Tauri 2](https://github.com/tauri-apps/tauri) | MIT/Apache-2.0 | Native desktop shell, service lifecycle |
| [lucide-react](https://github.com/lucide-icons/lucide) | ISC | Icons |
| [highlight.js](https://github.com/highlightjs/highlight.js) | BSD-3 | Syntax highlighting |

## Optional service

| | Use |
|---|---|
| [Tavily](https://tavily.com) | Optional web-search augmentation — disabled unless the user supplies an API key |

## Datasets / pre-existing work

- The bundled interview problems (20 DSA + 20 LLD, in `frontend/src/data/`) were written for this project; problem *styles* follow common interview formats (LeetCode-style DSA statements, classic LLD prompts like "design a parking lot").
- No third-party datasets are redistributed with this repository.

Thanks to all upstream maintainers — this project is only possible because local-first AI infrastructure is open source.
