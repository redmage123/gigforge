"""Pydantic settings — env-driven config for the cryptoadvisor-ai service."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="CA_AI_", extra="ignore")

    # Gemma server
    gemma_host: str = "http://176.9.99.103:11434"
    gemma_token: str = ""
    gemma_model_chat: str = "gemma-4-e4b-base:latest"
    gemma_model_explain: str = "gemma-4-e4b-base:latest"
    gemma_model_embed: str = "nomic-embed-text:latest"

    # KG + RAG storage
    kg_db_path: str = "/data/kg.sqlite"
    rag_db_path: str = "/data/rag.sqlite"

    # Server
    cors_origins: str = "http://localhost:5173,http://localhost:4102,http://78.47.104.139:4102"


settings = Settings()
