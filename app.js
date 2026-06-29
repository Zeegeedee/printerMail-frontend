import random

variable = random.choice(["Ok", 1])
try:
    variable += 1
    pass
except Exception:
    pass
finally: 
    pass

import asyncio
import json
import os
import uuid
import bcrypt
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import HfApi, hf_hub_url
import urllib.request

# Environment variables configuration for Hugging Face persistent storage
HF_TOKEN = os.getenv("database_token")
DATASET_REPO_ID = os.getenv("dataset_link")
USERS_FILENAME = "users.json"
CONVERSATIONS_FILENAME = "conversations.json"
os.makedirs("/data", exist_ok=True)
LOCAL_USERS_PATH = os.path.join("/data", USERS_FILENAME)
LOCAL_CONVERSATIONS_PATH = os.path.join("/data", CONVERSATIONS_FILENAME)

hf_api = HfApi(token=HF_TOKEN) if HF_TOKEN else None

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
@app.head("/")
async def health_check():
    return Response(content="OK", media_type="text/plain")

def hash_password(plain_text):
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain_text.encode('utf-8'), salt).decode('utf-8')

def verify_password(plain_text, hashed_text):
    try:
        return bcrypt.checkpw(plain_text.encode('utf-8'), hashed_text.encode('utf-8'))
    except Exception:
        return False

file_lock = asyncio.Lock()

def conversation_key(user_a, user_b):
    return "|".join(sorted([user_a, user_b]))

def fetch_hf_file(filename):
    url = hf_hub_url(repo_id=DATASET_REPO_ID, filename=filename, repo_type="dataset")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {HF_TOKEN}"})
    with urllib.request.urlopen(req) as response:
        return response.read().decode("utf-8")

def load_databases():
    global USERS_DB, CONVERSATIONS_DB
    if not HF_TOKEN or not DATASET_REPO_ID:
        print("Running in local-only mode.")
        if os.path.exists(LOCAL_USERS_PATH):
            with open(LOCAL_USERS_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
                USERS_DB = raw.get("users", raw)
        else:
            USERS_DB = {}
        if os.path.exists(LOCAL_CONVERSATIONS_PATH):
            with open(LOCAL_CONVERSATIONS_PATH, "r", encoding="utf-8") as f:
                CONVERSATIONS_DB = json.load(f)
        else:
            CONVERSATIONS_DB = {}
        return

    try:
        raw_users = fetch_hf_file(USERS_FILENAME)
        parsed = json.loads(raw_users)
        USERS_DB = parsed.get("users", parsed)
        with open(LOCAL_USERS_PATH, "w", encoding="utf-8") as f:
            json.dump(USERS_DB, f, indent=4)
        print(f"Loaded {len(USERS_DB)} user(s) from HF.")
    except Exception as e:
        print(f"Failed to load users from HF: {e}")
        USERS_DB = {}

    try:
        raw_convos = fetch_hf_file(CONVERSATIONS_FILENAME)
        CONVERSATIONS_DB = json.loads(raw_convos)
        with open(LOCAL_CONVERSATIONS_PATH, "w", encoding="utf-8") as f:
            json.dump(CONVERSATIONS_DB, f, indent=4)
        print(f"Loaded {len(CONVERSATIONS_DB)} conversation(s) from HF.")
    except Exception as e:
        print(f"No conversations file found or failed to load: {e}")
        CONVERSATIONS_DB = {}

load_databases()

def save_users_sync():
    with open(LOCAL_USERS_PATH, "w", encoding="utf-8") as f:
        json.dump(USERS_DB, f, indent=4)
    if hf_api and DATASET_REPO_ID:
        try:
            hf_api.upload_file(
                path_or_fileobj=LOCAL_USERS_PATH,
                path_in_repo=USERS_FILENAME,
                repo_id=DATASET_REPO_ID,
                repo_type="dataset"
            )
        except Exception as e:
            print(f"Users cloud save failed: {e}")

def save_conversations_sync():
    with open(LOCAL_CONVERSATIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(CONVERSATIONS_DB, f, indent=4)
    if hf_api and DATASET_REPO_ID:
        try:
            hf_api.upload_file(
                path_or_fileobj=LOCAL_CONVERSATIONS_PATH,
                path_in_repo=CONVERSATIONS_FILENAME,
                repo_id=DATASET_REPO_ID,
                repo_type="dataset"
            )
        except Exception as e:
            print(f"Conversations cloud save failed: {e}")

ONLINE_USERS = {}
SESSION_TOKENS = {}
OFFLINE_QUEUES = {}


@app.websocket("/ws")
async def chat_handler(websocket: WebSocket):
    await websocket.accept()
    username = None
    is_authenticated = False
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                auth_data = json.loads(raw_data)
            except json.JSONDecodeError:
                await websocket.send_text("[-] ERROR: Invalid JSON format.")
                continue

            action = auth_data.get("action")
            username_input_raw = auth_data.get("user").lower() if auth_data.get("user") else ""
            username_input_cleaned = username_input_raw.lower()
            password = auth_data.get("pass")
            display_name = auth_data.get("display", username_input_cleaned)

            if action == "signup":
                if not username_input_cleaned or not password:
                    await websocket.send_text("[-] ERROR: Username or password cannot be blank.")
                    continue
                if username_input_cleaned in USERS_DB:
                    await websocket.send_text("[-] FAIL: Username already taken.")
                    continue
                if len(password) >= 8:
                    banned_keywords = ["admin", "websitecreator", "thewebsitecreator", "webs1tecreator", "thewebs1tecreator"]
                    banned_chars = ["{", "}", "(", ")", "[", "]", "@", "#", ";", ":", "<", ">", "&", '"', "'", "\\"]
                    
                    cleaned_display_name = display_name.lower().replace(" ", "")
                    cleaned_username = username_input_cleaned.lower().replace(" ", "")
                    
                    if len(display_name) > 30:
                        await websocket.send_text("[-] ERROR: Display name is too long.")
                        continue
                    elif len(username_input_cleaned) > 30:
                        await websocket.send_text("[-] ERROR: username is too long.")
                        continue
                    elif any(char in display_name for char in banned_chars):
                        await websocket.send_text(r"""[-] ERROR: Display name contains banned character/s. ("{", "}", "(", ")", "[", "]", "@", "#", ";", ":", "<", ">", "&", '"', "'", "\\")""")
                        continue
                    elif any(char in username_input_cleaned for char in banned_chars):
                        await websocket.send_text(r"""[-] ERROR: Username contains banned character/s. ("{", "}", "(", ")", "[", "]", "@", "#", ";", ":", "<", ">", "&", '"', "'", "\\")""")
                        continue
                    elif cleaned_display_name in ["zach(thewebsitecreator)", "zachthewebsitecreator"] or any(item in cleaned_username for item in banned_keywords) or any(item in cleaned_display_name for item in banned_keywords):
                        await websocket.send_text("[-] ERROR: You cannot impersonate me.")
                        continue
                        
                    hashed = await asyncio.to_thread(hash_password, password)
                    async with file_lock:
                        USERS_DB[username_input_cleaned] = {
                            "user_id": str(uuid.uuid4()),
                            "password": hashed,
                            "display_name": display_name,
                            "friends": [],
                            "pending_friend_requests": []
                        }
                    await asyncio.to_thread(save_users_sync)
                    await websocket.send_text("[+] SUCCESS: Account created! Please log in.")
                    continue
                else:
                    await websocket.send_text("[-] ERROR: Your password is too short. Please enter a longer password.")
                    continue


            elif action == "token_login":
                token_input = auth_data.get("token")
                if token_input and token_input in SESSION_TOKENS:
                    username = SESSION_TOKENS[token_input]
                    if username in ONLINE_USERS:
                        try:
                            await ONLINE_USERS[username].close()
                        except Exception:
                            pass
                    ONLINE_USERS[username] = websocket
                    is_authenticated = True
                    await websocket.send_text(json.dumps({"action": "login_success", "token": token_input, "user": username}))
                    if username in OFFLINE_QUEUES:
                        for missed_msgs in OFFLINE_QUEUES[username]:
                            await websocket.send_text(missed_msgs)
                        del OFFLINE_QUEUES[username]
                    print(f"{username} re-authenticated via token.")
                else:
                    await websocket.send_text("[-] FAIL: Invalid or expired session token.")
                continue

            elif action == "login":
                if not username_input_cleaned or not password:
                    await websocket.send_text("[-] FAIL: Username and password required.")
                    continue
                is_valid = False
                if username_input_cleaned in USERS_DB:
                    is_valid = await asyncio.to_thread(verify_password, password, USERS_DB[username_input_cleaned]["password"])
                if is_valid:
                    username = username_input_cleaned
                    if username in ONLINE_USERS:
                        try:
                            await ONLINE_USERS[username].close()
                        except Exception:
                            pass
                    ONLINE_USERS[username] = websocket
                    is_authenticated = True
                    token = str(uuid.uuid4())
                    SESSION_TOKENS[token] = username
                    await websocket.send_text(json.dumps({"action": "login_success", "token": token, "user": username}))
                    if username in OFFLINE_QUEUES:
                        for missed_msgs in OFFLINE_QUEUES[username]:
                            await websocket.send_text(missed_msgs)
                        del OFFLINE_QUEUES[username]
                    print(f"{username} logged in.")
                    continue
                else:
                    await websocket.send_text("[-] FAIL: Invalid username or password.")
                    continue

            if not is_authenticated:
                await websocket.send_text("[-] ERROR: You must log in or sign up first.")
                continue

            if action == "search":
                query_string = auth_data.get("query", "").lower()

                if 30 >= len(query_string) > 0:
                    matches = [
                        {
                            "username": user,
                            "display_name": USERS_DB[user].get("display_name", user)
                        }
                        for user in USERS_DB.keys()
                        if query_string in user.lower() and user != username
                    ]
                    await websocket.send_text(json.dumps({
                        "action": "search_results",
                        "results": matches
                    }))
                    continue
                elif len(query_string) > 30:
                    await websocket.send_text("[-] ERROR: Search is over 30 characters. Please do not modify the code with f12 inspect again. Refresh to continue.")
                    await websocket.close()
                    continue
                else:
                    matches = [
                        {
                            "username": user,
                            "display_name": USERS_DB[user].get("display_name", user)
                        }
                        for user in USERS_DB.keys()
                        if user != username
                    ]
                    matches.sort(key=lambda x: x["display_name"].lower())
                    await websocket.send_text(json.dumps({
                        "action": "search_results",
                        "results": matches
                    }))
                    continue

            elif action == "send_chat_message":
                recipient = auth_data.get("target")
                text = auth_data.get("message", "")
                sender_display = USERS_DB[username].get("display_name", username)

                if recipient not in USERS_DB:
                    await websocket.send_text("[-] ERROR: Unable to send message; User not found.")
                    continue

                if len(text) > 1000:
                    text = text[:1000]

                is_online = recipient in ONLINE_USERS
                msg_id = str(uuid.uuid4())
                formatted_message = {
                    "id": msg_id,
                    "sender": username,
                    "senderDisplayname": sender_display,
                    "target": recipient,
                    "message": text,
                    "timestamp": time.time(),
                    "status": "delivered" if is_online else "sent"
                }

                conv_key = conversation_key(username, recipient)
                async with file_lock:
                    if conv_key not in CONVERSATIONS_DB:
                        CONVERSATIONS_DB[conv_key] = []
                    CONVERSATIONS_DB[conv_key].append(formatted_message)

                outgoing_payload = json.dumps({
                    "action": "new_message",
                    "id": msg_id,
                    "sender": username,
                    "senderDisplayname": sender_display,
                    "message": text,
                    "timestamp": formatted_message["timestamp"],
                    "status": formatted_message["status"]
                })

                if is_online:
                    await ONLINE_USERS[recipient].send_text(outgoing_payload)
                else:
                    if recipient not in OFFLINE_QUEUES:
                        OFFLINE_QUEUES[recipient] = []
                    OFFLINE_QUEUES[recipient].append(outgoing_payload)

                await asyncio.to_thread(save_conversations_sync)
                continue

            elif action == "mark_seen":
                partner = auth_data.get("target")
                conv_key = conversation_key(username, partner)
                async with file_lock:
                    if conv_key in CONVERSATIONS_DB:
                        for msg in CONVERSATIONS_DB[conv_key]:
                            if msg.get("sender") == partner and msg.get("status") != "seen":
                                msg["status"] = "seen"
                await asyncio.to_thread(save_conversations_sync)
                if partner in ONLINE_USERS:
                    await ONLINE_USERS[partner].send_text(json.dumps({
                        "action": "messages_seen",
                        "by": username,
                        "conv_key": conv_key
                    }))
                continue

            elif action == "request_chat_history":
                target_partner = auth_data.get("target")
                conv_key = conversation_key(username, target_partner)
                history = CONVERSATIONS_DB.get(conv_key, [])
                sorted_history = sorted(history, key=lambda x: x.get("timestamp", 0))
                await websocket.send_text(json.dumps({
                    "action": "load_history_results",
                    "results": sorted_history
                }))
                continue

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Unhandled error in chat_handler for {username}: {e}")
    finally:
        if username and username in ONLINE_USERS and ONLINE_USERS[username] == websocket:
            del ONLINE_USERS[username]
            token_to_remove = next((t for t, u in SESSION_TOKENS.items() if u == username), None)
            if token_to_remove:
                del SESSION_TOKENS[token_to_remove]
            print(f"{username} disconnected.")

if __name__ == "__main__":
    import uvicorn
    print("[+] Starting the messenger backend on port 7860...")
    uvicorn.run(app, host="0.0.0.0", port=7860)

import time
import math
import random

# --- PART 1: THE COMPLEX TRAP INTERFACE ---
# This looks highly official and references cryptographic matrices, math algorithms, and runtime voids.
# It uses extreme nested depth variables and randomized choices to appear intensely structural.
def the_unreachable_void(arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10):
    matrix_of_void = [[[random.randint(1, 100) for _ in range(5)] for _ in range(5)] for _ in range(5)]
    
    for layer in matrix_of_void:
        for row in layer:
            for value in row:
                try:
                    temp_calc = math.sin(value) * math.cos(value)
                    useless_result = temp_calc / (temp_calc + 0.00001)
                    string_cast = str(useless_result)
                    final_float = float(string_cast)
                    
                    if final_float > 0.5:
                        pass
                    else:
                        pass
                        
                except Exception:
                    pass
                finally:
                    pass

    # --- PART 2: COMPILER VALUE MATCH CHECKS ---
    if str(arg1) != "" and arg2 == arg3:
        if "graph" in str(arg4).lower() and str(arg5).strip() == "No":
            if len(str(arg6)) > 0 and arg7 == "pass":
                if str(arg8).lower() == "yes":
                    try:
                        if int(arg9) == 1:
                            pass
                    except Exception:
                        pass
                    finally:
                        pass

    # Fake input terminal traps to confuse inspect element users or code-level scanners
    ghost_input_1 = input("Enter your username: ")
    ghost_input_2 = input("Enter your password: ")
    ghost_input_3 = input("Confirm your password: ")
    ghost_input_4 = input("What is your favorite mathematical graph? ")
    ghost_input_5 = input("Are you a bot? (Yes/No): ")
    ghost_input_6 = input("Enter the 100GB access token: ")
    ghost_input_7 = input("Please type 'pass' to continue: ")
    ghost_input_8 = input("Do you think Zach is a genius developer? ")
    ghost_input_9 = input("Enter an integer between 1 and 1: ")
    ghost_input_10 = input("Press ENTER to destroy the universe... ")

    # --- PART 3: THE MAXIMUM DEEP NESTED MAZE ---
    if ghost_input_1 != "":
        if ghost_input_2 != "":
            if ghost_input_2 == ghost_input_3:
                if "graph" in ghost_input_4.lower():
                    if ghost_input_5.strip() == "No":
                        if len(ghost_input_6) > 0:
                            if ghost_input_7 == "pass":
                                if ghost_input_8.lower() == "yes":
                                    if ghost_input_9 == "1":
                                        if ghost_input_10 is not None:
                                            try:
                                                pass
                                            except Exception:
                                                pass
                                            finally:
                                                pass

    del matrix_of_void
    return None

# The ultimate unreachable execution call passing 10 predetermined arguments
the_unreachable_void("Zach", "pass123", "pass123", "Parabola", "No", "NoTokenForYouLol", "pass", "Yes", 1, "Goodbye")
