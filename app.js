let currentChatPartner = "";
let loggedInUser = "";
const localChatLogs = {};

const HF_SPACE_HOST = "zeegeedee-printermail-backend.hf.space";
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${HF_SPACE_HOST}/ws`);

socket.onopen = function () {
    console.log("[+] Connected! Welcome to the Python server.");
    const savedToken = sessionStorage.getItem("sessionToken");
    if (savedToken) {
        socket.send(JSON.stringify({ action: "token_login", token: savedToken }));
    }
};

socket.onerror = function (error) {
    console.error("[-] WebSocket error:", error);
    alert("Connection error. Please refresh the page and try again.");
};

socket.onclose = function (event) {
    console.warn("[-] WebSocket connection closed. Code:", event.code);
    if (event.code !== 1000 && event.code !== 1001) {
        sessionStorage.clear();
        alert("You have been disconnected unexpectedly. Please refresh the page to reconnect.");
    }
};

socket.onmessage = function (event) {
    let incomingText = event.data;

    if (incomingText.startsWith("{")) {
        try {
            let parsedData = JSON.parse(incomingText);

            if (parsedData.action === "login_success") {
                loggedInUser = parsedData.user;
                sessionStorage.setItem("sessionToken", parsedData.token);
                sessionStorage.setItem("sessionUser", parsedData.user);
                choiceName.value = "";
                choicePassword.value = "";
                document.getElementById("authGate").style.display = "none";
                document.getElementById("appContainer").style.display = "block";
                document.getElementById("messageInput").disabled = false;
                document.getElementById("sendMessageButton").disabled = false;
                const buttons = document.querySelectorAll("#userList button");
                buttons.forEach(btn => btn.disabled = false);
                return;
            }
            else if (parsedData.action === "search_results") {
                renderDiscoveredUsers(parsedData.results);
                return;
            }
            else if (parsedData.action === "incoming_friend_request") {
                let friendRequestConfirmationWindow = window.confirm(parsedData.sender + " sent a friend request! Accept?");
                if (friendRequestConfirmationWindow) {
                    socket.send(JSON.stringify({ "action": "accept_friend_request", "from_user": parsedData.sender }));
                }
                return;
            }
            else if (parsedData.action === "load_history_results") {
                document.getElementById("chatHistory").innerHTML = "";
                parsedData.results.forEach(msg => {
                    
                let oldBubble = document.createElement("div");
                let isMe = msg.sender === loggedInUser;
                let displayName = isMe ? "You" : (msg.senderDisplayname || msg.sender);
                let username = msg.sender;
                let timeStr = new Date(msg.timestamp * 1000).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila"}) + " PHT";

                let line1 = document.createElement("span");
                line1.innerHTML = `${displayName} • <span style="font-size:0.95em; color:#666;">${timeStr} • ${msg.status}</span>`;
                line1.style.display = "block";

                let line2 = document.createElement("span");
                line2.style.display = "block";
                line2.style.color = "#666";
                line2.style.fontSize = "0.95em";

                let userPart = document.createElement("span");
                userPart.innerText = `@${username} `;

                let textPart = document.createElement("span");
                textPart.innerText = msg.message;
                textPart.style.fontSize = "1.25em";
                textPart.style.color = "black";

                line2.append(userPart, textPart);


                    oldBubble.appendChild(line1);
                    oldBubble.appendChild(line2);
                    document.getElementById("chatHistory").appendChild(oldBubble);
                });
                scrollToBottom();
                return;
            }
            else if (parsedData.action === "new_message") {
                let senderName = parsedData.sender;
                let textContent = parsedData.message;

                if (!localChatLogs[senderName]) {
                    localChatLogs[senderName] = [];
                }
                localChatLogs[senderName].push(`${senderName}: ${textContent}`);

                if (currentChatPartner === senderName) {
                    let chatBubble = document.createElement("div");
                    let senderDisplay = parsedData.senderDisplayname || senderName;
                    let timeStr = new Date(parsedData.timestamp * 1000).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila"}) + " PHT";

                    let line1 = document.createElement("span");
                    line1.innerText = senderDisplay + " • " + timeStr + " • " + parsedData.status;
                    line1.style.display = "block";

                    let line2 = document.createElement("span");
                    line2.innerHTML = `@${senderName} <span style="font-size:1.25em; color:black;">${textContent}</span>`;
                    line2.style.display = "block";
                    line2.style.color = "#666";
                    line2.style.fontSize = "0.95em";
                    line2.style.backgroundColor = "#f0f0f0";
                    line2.style.padding = "8px 12px";
                    line2.style.borderRadius = "12px";
                    line2.style.marginTop = "4px";


                    chatBubble.appendChild(line1);
                    chatBubble.appendChild(line2);
                    document.getElementById("chatHistory").appendChild(chatBubble);
                    scrollToBottom();
                }
                return;
            }

        } catch (error) {
            console.error("[-] Failed to parse JSON:", error);
        }
    }

    if (incomingText === "[+] SUCCESS: Account created! Please log in.") {
        alert(incomingText);

        choiceName.value = "";
        choicePassword.value = "";
        choiceConfirmPassword.value = "";
        choiceDisplayName.value = "";

        document.getElementById("authAction").value = "login";
        document.getElementById("authConfirmPassword").style.display = "none";
        document.getElementById("confirmPasswordLabel").style.display = "none";
        document.getElementById("authDisplayName").style.display = "none";
        document.getElementById("chooseDisplayNameLabel").style.display = "none";
        return;
    }
    else if (incomingText.startsWith("[-] ERROR:") || incomingText.startsWith("[-] FAIL:")) {
        alert(incomingText);
        authErrorMessage.style.display = "block";
        authErrorMessage.innerText = incomingText;
        choicePassword.value = "";
        choiceConfirmPassword.value = "";
        return;
    }
};

function scrollToBottom() {
    const chatHistory = document.getElementById("chatHistory");
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

const searchResultsContainer = document.getElementById("searchResultsContainer");

function renderDiscoveredUsers(usersArray) {
    searchResultsContainer.innerHTML = "";
    usersArray.forEach(friend => {
        let userButton = document.createElement("button");
        let sendFriendRequestButton = document.createElement("button");
        userButton.innerText = friend.display_name;
        sendFriendRequestButton.innerText = "Send Friend Request 👥➕";

        userButton.addEventListener('click', function () {
            if (searchSection && searchSection.style.display === "block") {
                currentChatPartner = friend.username;
                document.getElementById("chatHistory").innerHTML = "";

                if (messagingSection && searchSection) {
                    messagingSection.style.display = "block";
                    searchSection.style.display = "none";
                }

                socket.send(JSON.stringify({
                    action: "request_chat_history",
                    target: friend.username
                }));
                console.log(`Target recipient: ${currentChatPartner}`);
            }
        });

        sendFriendRequestButton.addEventListener('click', function () {
            if (searchSection && searchSection.style.display === "block") {
                socket.send(JSON.stringify({ action: "send_friend_request", target: friend.username }));
            }
        });

        searchResultsContainer.appendChild(userButton);
        searchResultsContainer.appendChild(sendFriendRequestButton);
    });
}

function processInputs(event) {
    if (event) event.preventDefault();
    const messageBox = document.getElementById("messageInput");
    let messageValue = messageBox.value.trim();

    if (currentChatPartner === "" || messageValue === "") return;

    let dataBundle = {
        action: "send_chat_message",
        target: currentChatPartner,
        message: messageValue,
        timestamp: Date.now()
    };

    if (!localChatLogs[currentChatPartner]) {
        localChatLogs[currentChatPartner] = [];
    }
    localChatLogs[currentChatPartner].push(`You: ${messageValue}`);

    let chatBubble = document.createElement("div");
    let timeStr = new Date(Date.now()).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila"}) + " PHT";

    let line1 = document.createElement("span");
    line1.innerText = "You • " + timeStr + " • sending...";
    line1.style.display = "block";

    let line2 = document.createElement("span");
    line2.innerHTML = `@${loggedInUser} <span style="font-size:1.25em; color:black;">${messageValue}</span>`;
    line2.style.display = "block";
    line2.style.color = "#666";
    line2.style.fontSize = "0.95em";

    chatBubble.appendChild(line1);
    chatBubble.appendChild(line2);
    document.getElementById("chatHistory").appendChild(chatBubble);
    scrollToBottom();

    socket.send(JSON.stringify(dataBundle));
    messageBox.value = "";
}

const choiceDropdown = document.getElementById("authAction");
const choiceName = document.getElementById("authUsername");
const choicePassword = document.getElementById("authPassword");
const confirmPasswordLabel = document.getElementById("confirmPasswordLabel");
const choiceConfirmPassword = document.getElementById("authConfirmPassword");
const chooseDisplayNameLabel = document.getElementById("chooseDisplayNameLabel");
const choiceDisplayName = document.getElementById("authDisplayName");
const authErrorMessage = document.getElementById("authErrorMessage");

const sendButton = document.getElementById("sendMessageButton");
sendButton.addEventListener('click', processInputs);

document.getElementById("messageInput").addEventListener('keydown', function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        processInputs(event);
    }
});

const chatsModeButton = document.getElementById("chatsModeButton");
const searchModeButton = document.getElementById("searchModeButton");

const messagingSection = document.getElementById("messagingSection");
const searchSection = document.getElementById("searchSection");

if (chatsModeButton) {
    chatsModeButton.addEventListener('click', function () {
        messagingSection.style.display = "block";
        searchSection.style.display = "none";
        console.log("📱 Switched UI panel view to Messaging Mode.");
    });
}

if (searchModeButton) {
    searchModeButton.addEventListener('click', function () {
        messagingSection.style.display = "none";
        searchSection.style.display = "block";
        console.log("🔍 Switched UI panel view to User Search Mode.");
    });
}

choiceDropdown.addEventListener('change', function () {
    if (choiceDropdown.value === "login") {
        choiceConfirmPassword.style.display = "none";
        confirmPasswordLabel.style.display = "none";
        choiceDisplayName.style.display = "none";
        chooseDisplayNameLabel.style.display = "none";
        authErrorMessage.innerText = "";
    } else {
        choiceConfirmPassword.style.display = "block";
        confirmPasswordLabel.style.display = "";
        choiceDisplayName.style.display = "block";
        chooseDisplayNameLabel.style.display = "";
        authErrorMessage.innerText = "";
    }
});

function runAuthVerification(event) {
    if (event) event.preventDefault();
    let authAction = choiceDropdown.value;
    let authUsername = choiceName.value.toLowerCase().trim();
    let authPassword = choicePassword.value;
    let authConfirmPassword = choiceConfirmPassword.value;
    let authDisplayName = choiceDisplayName.value;

    if (authAction === "signup") {
        if (authPassword !== authConfirmPassword) {
            authErrorMessage.style.display = "block";
            authErrorMessage.innerText = "[-] Passwords do not match. Please check your typing.";
            return;
        }
        const authPackage = { "action": authAction, "display": authDisplayName, "user": authUsername, "pass": authPassword };
        authErrorMessage.style.display = "none";
        socket.send(JSON.stringify(authPackage));
    }
    else if (authAction === "login") {
        const loginPackage = { "action": authAction, "user": authUsername, "pass": authPassword };
        socket.send(JSON.stringify(loginPackage));
    }
}

[choiceName, choicePassword, choiceConfirmPassword, choiceDisplayName].forEach(input => {
    if (input) {
        input.addEventListener('keydown', function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                runAuthVerification(event);
            }
        });
    }
});

const submitAuthCredentials = document.getElementById("authSubmitButton");
submitAuthCredentials.addEventListener('click', runAuthVerification);

const userSearchInput = document.getElementById("userSearchInput");
if (userSearchInput) {
    userSearchInput.addEventListener('input', function () {
        let typedText = userSearchInput.value.trim();
        if (typedText.length === 0) {
            searchResultsContainer.innerHTML = "";
            return;
        }
        socket.send(JSON.stringify({ "action": "search", "query": typedText }));
        console.log(`📡 Broadcasted search query to server: ${typedText}`);
    });
}

if (messagingSection && searchSection) {
    messagingSection.style.display = "block";
    searchSection.style.display = "none";
}

document.getElementById("appContainer").style.display = "none";
document.getElementById("messageInput").disabled = true;
document.getElementById("sendMessageButton").disabled = true;
document.getElementById("confirmPasswordLabel").style.display = "none";
document.getElementById("authConfirmPassword").style.display = "none";
document.getElementById("authDisplayName").style.display = "none";
document.getElementById("chooseDisplayNameLabel").style.display = "none";
authErrorMessage.style.display = "none";
searchSection.style.display = "none";
