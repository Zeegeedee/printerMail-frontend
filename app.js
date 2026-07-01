let currentChatPartner = "";
let pendingRequests = [];
let friends = [];
let lastSearchResults = [];
let loggedInUser = "";
const localChatLogs = {};

const HF_SPACE_HOST = "zeegeedee-printermail-backend.hf.space";
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${HF_SPACE_HOST}/ws`);

socket.onopen = function () {
    console.log("[+] Connected! Welcome to the Python server.");
    const savedToken = sessionStorage.getItem("sessionToken");
    const savedRememberToken = localStorage.getItem("rememberToken");
    if (savedToken) {
        socket.send(JSON.stringify({ action: "token_login", token: savedToken }));
    } else if (savedRememberToken) {
        socket.send(JSON.stringify({ action: "token_login", remember_token: savedRememberToken }));
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
        localStorage.removeItem("rememberToken");
        localStorage.removeItem("sessionUser");
        alert("[-] ERROR: You have been disconnected unexpectedly. Please refresh the page to reconnect.");
    }
};

socket.onmessage = function (event) {
    let incomingText = event.data;

    if (incomingText.startsWith("{")) {
        try {
            let parsedData = JSON.parse(incomingText);

            if (parsedData.action === "login_success") {
                loggedInUser = parsedData.user;
                const rememberMeCheckbox = document.getElementById("authRememberMe");
                let rememberMe = rememberMeCheckbox.checked;
                pendingRequests = parsedData.pending_friend_requests;
                friends = parsedData.friends;

                if (rememberMe) {
                    localStorage.setItem("rememberToken", parsedData.remember_token);
                    localStorage.setItem("sessionUser", parsedData.user);
                } else {
                    sessionStorage.setItem("sessionToken", parsedData.token);
                    sessionStorage.setItem("sessionUser", parsedData.user);
                }

                choiceName.value = "";
                choicePassword.value = "";
                rememberMeCheckbox.checked = false;

                rememberMeCheckbox.style.display = "none";
                rememberMeLabel.style.display = "none";
                document.getElementById("authGate").style.display = "none";
                document.getElementById("appContainer").style.display = "block";
                document.getElementById("messageInput").disabled = false;
                document.getElementById("sendMessageButton").disabled = false;
                const buttons = document.querySelectorAll("#userList button");
                buttons.forEach(btn => btn.disabled = false);
                return;
            } else if (parsedData.action === "search_results") {
                lastSearchResults = parsedData.results;
                renderDiscoveredUsers(parsedData.results);
                return;
            } else if (parsedData.action === "incoming_friend_request") {
                pendingRequests.push({
                    username: parsedData.sender,
                    display_name: parsedData.display_name
                });
                renderDiscoveredUsers(lastSearchResults);
                let friendRequestConfirmationWindow = window.confirm(parsedData.sender + " sent a friend request! Accept?");
                if (friendRequestConfirmationWindow) {
                    socket.send(JSON.stringify({ "action": "accept_friend_request", "from_user": parsedData.sender }));
                }
                return;
            } else if (parsedData.action === "load_history_results") {
                document.getElementById("chatHistory").innerHTML = "";
                parsedData.results.forEach(msg => {
                    let oldBubble = document.createElement("div");

                    let isMe = msg.sender === loggedInUser;
                    let displayName = isMe ? "You" : (msg.senderDisplayname || msg.sender);
                    let timeStr = new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }) + " PHT";

                    oldBubble.className = isMe ? "msg-bubble msg-bubble-mine" : "msg-bubble msg-bubble-theirs";

                    let line1 = document.createElement("span");
                    line1.className = "msg-meta";
                    line1.innerHTML = `${displayName} • <span class="msg-meta-detail">${timeStr} • ${msg.status}</span>`;

                    let line2 = document.createElement("span");
                    line2.className = "msg-sender";

                    let userPart = document.createElement("span");
                    userPart.className = "msg-username";
                    userPart.innerText = `@${msg.sender} `;

                    let messageBox = document.createElement("div");
                    messageBox.className = "msg-box";

                    let textPart = document.createElement("span");
                    textPart.className = "msg-text";
                    textPart.innerText = msg.message;

                    messageBox.appendChild(textPart);
                    line2.appendChild(userPart);
                    oldBubble.appendChild(line1);
                    oldBubble.appendChild(line2);
                    oldBubble.appendChild(messageBox);
                    document.getElementById("chatHistory").appendChild(oldBubble);
                });
                scrollToBottom();
                return;
            } else if (parsedData.action === "new_message") {
                let senderName = parsedData.sender;
                let textContent = parsedData.message;

                if (!localChatLogs[senderName]) {
                    localChatLogs[senderName] = [];
                }
                localChatLogs[senderName].push(`${senderName}: ${textContent}`);

                if (currentChatPartner === senderName) {
                    let chatBubble = document.createElement("div");
                    chatBubble.className = "msg-bubble";

                    let senderDisplay = parsedData.senderDisplayname || senderName;
                    let timeStr = new Date(parsedData.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }) + " PHT";

                    let line1 = document.createElement("span");
                    line1.className = "msg-meta";
                    line1.innerText = senderDisplay + " • " + timeStr + " • " + parsedData.status;

                    let line2 = document.createElement("span");
                    line2.className = "msg-sender";

                    let userPart = document.createElement("span");
                    userPart.className = "msg-username";
                    userPart.innerText = `@${senderName} `;

                    let messageBox = document.createElement("div");
                    messageBox.className = "msg-box";

                    let textPart = document.createElement("span");
                    textPart.className = "msg-text";
                    textPart.innerText = textContent;

                    messageBox.appendChild(textPart);
                    line2.appendChild(userPart);
                    chatBubble.appendChild(line1);
                    chatBubble.appendChild(line2);
                    chatBubble.appendChild(messageBox);
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
    } else if (incomingText.startsWith("[-] ERROR:") || incomingText.startsWith("[-] FAIL:")) {
        alert(incomingText);
        if (incomingText.includes("session token")) {
            sessionStorage.clear();
            localStorage.removeItem("rememberToken");
            localStorage.removeItem("sessionUser");
            document.getElementById("authGate").style.display = "block";
            document.getElementById("appContainer").style.display = "none";
        } else {
            authErrorMessage.style.display = "block";
            authErrorMessage.innerText = incomingText;
        }
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
        userButton.className = "search-user-btn";
        userButton.innerText = friend.display_name;

        let userUsernameDisplay = document.createElement("p");
        userUsernameDisplay.className = "search-user-username";
        userUsernameDisplay.innerText = "@" + friend.username;

        let sendFriendRequestButton = document.createElement("button");
        sendFriendRequestButton.className = "friend-request-btn";
        sendFriendRequestButton.innerText = "Send Friend Request 👥➕";

        if (pendingRequests.some(r => r.username === friend.username)) {
            sendFriendRequestButton.innerText = "Friend Request Sent! 👥✓";
            sendFriendRequestButton.disabled = true;
        }

        if (friends.includes(friend.username)) {
            sendFriendRequestButton.innerText = "Friends! 👥";
            sendFriendRequestButton.disabled = true;
        }

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
        searchResultsContainer.appendChild(userUsernameDisplay);
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
    chatBubble.className = "msg-bubble";

    let timeStr = new Date(Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }) + " PHT";

    let line1 = document.createElement("span");
    line1.className = "msg-meta";
    line1.innerText = "You • " + timeStr + " • sending...";

    let line2 = document.createElement("span");
    line2.className = "msg-sender";

    let userPart = document.createElement("span");
    userPart.className = "msg-username";
    userPart.innerText = "@" + loggedInUser + " ";

    let msgBox = document.createElement("div");
    msgBox.className = "msg-box";

    let textPart = document.createElement("span");
    textPart.className = "msg-text";
    textPart.innerText = messageValue;

    msgBox.appendChild(textPart);
    line2.appendChild(userPart);
    chatBubble.appendChild(line1);
    chatBubble.appendChild(line2);
    chatBubble.appendChild(msgBox);
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
const authRememberMe = document.getElementById("authRememberMe");
const rememberMeLabel = document.getElementById("rememberMeLabel");

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
const friendRequestsSection = document.getElementById("friendRequestsSection");

if (chatsModeButton) {
    chatsModeButton.addEventListener('click', function () {
        messagingSection.style.display = "block";
        searchSection.style.display = "none";
        friendRequestsSection.style.display = "none";
        console.log("📱 Switched UI panel view to Messaging Mode.");
    });
}

if (searchModeButton) {
    searchModeButton.addEventListener('click', function () {
        messagingSection.style.display = "none";
        searchSection.style.display = "block";
        friendRequestsSection.style.display = "none";
        console.log("🔍 Switched UI panel view to User Search Mode.");
    });
}

choiceDropdown.addEventListener('change', function () {
    if (choiceDropdown.value === "login") {
        choiceConfirmPassword.style.display = "none";
        confirmPasswordLabel.style.display = "none";
        choiceDisplayName.style.display = "none";
        chooseDisplayNameLabel.style.display = "none";
        authRememberMe.style.display = "block";
        rememberMeLabel.style.display = "";
        authErrorMessage.innerText = "";

    } else {
        choiceConfirmPassword.style.display = "block";
        confirmPasswordLabel.style.display = "";
        choiceDisplayName.style.display = "block";
        chooseDisplayNameLabel.style.display = "";
        authErrorMessage.innerText = "";
        authRememberMe.style.display = "none";
        rememberMeLabel.style.display = "none";
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
    } else if (authAction === "login") {
        const loginPackage = { "action": authAction, "user": authUsername, "pass": authPassword, "remember_me": authRememberMe.checked };
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

function triggerLogout() {
    const logoutPackage = { "action": "logout" };

    // Remember to change this when I add more stuff to the session/localStorage.
    socket.send(JSON.stringify(logoutPackage));
    sessionStorage.clear();
    localStorage.clear();

    console.log(`${loggedInUser} Logged out🔒. Goodbye!👋`);
    window.location.reload();
}

function renderFriendRequests() {
    friendRequestsSection.innerHTML = "<h3>Friend Requests:</h3>";
    if (!pendingRequests || pendingRequests.length === 0) {
        let noRequestsText = document.createElement("p");
        noRequestsText.innerText = "No Pending Friend Requests. You're all caught up!";
        friendRequestsSection.appendChild(noRequestsText);
        friendRequestsSection.style.display = "block";
        messagingSection.style.display = "none";
        searchSection.style.display = "none";
        return;
    }

    pendingRequests.forEach(pendingFriendRequest => {
        let displayNameBtn = document.createElement("button");
        displayNameBtn.className = "search-user-btn";
        displayNameBtn.innerText = pendingFriendRequest.display_name;

        let usernameDisplay = document.createElement("p");
        usernameDisplay.className = "search-user-username";
        usernameDisplay.innerText = "@" + pendingFriendRequest.username;

        let acceptBtn = document.createElement("button");
        acceptBtn.className = "accept-friend-request-btn";
        acceptBtn.innerText = "Accept Friend Request ✅";

        let declineBtn = document.createElement("button");
        declineBtn.className = "decline-friend-request-btn";
        declineBtn.innerText = "Decline Friend Request ❌";

        displayNameBtn.addEventListener('click', function () {
            currentChatPartner = pendingFriendRequest.username;
            document.getElementById("chatHistory").innerHTML = "";

            messagingSection.style.display = "block";
            searchSection.style.display = "none";
            friendRequestsSection.style.display = "none";

            socket.send(JSON.stringify({
                action: "request_chat_history",
                target: pendingFriendRequest.username
            }));
            console.log(`Target recipient: ${currentChatPartner}`);
        });

        acceptBtn.addEventListener('click', function () {
            socket.send(JSON.stringify({ action: "accept_friend_request", from_user: pendingFriendRequest.username }));
            pendingRequests = pendingRequests.filter(r => r.username !== pendingFriendRequest.username);
            renderFriendRequests();
        });

        declineBtn.addEventListener('click', function () {
            socket.send(JSON.stringify({ action: "decline_friend_request", from_user: pendingFriendRequest.username }));
            pendingRequests = pendingRequests.filter(r => r.username !== pendingFriendRequest.username);
            renderFriendRequests();
        });

        friendRequestsSection.appendChild(displayNameBtn);
        friendRequestsSection.appendChild(usernameDisplay);
        friendRequestsSection.appendChild(acceptBtn);
        friendRequestsSection.appendChild(declineBtn);
    });

    friendRequestsSection.style.display = "block";
    messagingSection.style.display = "none";
    searchSection.style.display = "none";
}

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

document.getElementById("messageInput").addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
});

document.getElementById("appContainer").style.display = "none";
document.getElementById("messageInput").disabled = true;
document.getElementById("sendMessageButton").disabled = true;
document.getElementById("chooseDisplayNameLabel").style.display = "none";
document.getElementById("authDisplayName").style.display = "none";
document.getElementById("confirmPasswordLabel").style.display = "none";
document.getElementById("authConfirmPassword").style.display = "none";
searchSection.style.display = "none";
