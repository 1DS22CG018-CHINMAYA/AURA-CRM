import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from dotenv import load_dotenv

# Adjust this import based on your folder structure if needed!
from models import User 

load_dotenv()

async def main():
    # Connect to MongoDB Atlas
    client = AsyncIOMotorClient(os.getenv("MONGODB_URI"))
    
    # Initialize Beanie with your database
    # Change 'aura_db' if you used a different name in Atlas
    await init_beanie(database=client.aura_db, document_models=[User])
    
    # Create your user document
    me = User(name="Chinmaya Adiga", email="chinmaya@example.com")
    await me.insert()
    
    print(f"\n✅ Success! Paste this into your frontend .env:")
    print(f"VITE_USER_ID={me.id}\n")

if __name__ == "__main__":
    asyncio.run(main())