from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from config import settings

client = AsyncIOMotorClient(settings.mongodb_uri)
db: AsyncIOMotorDatabase = client[settings.mongodb_database]
