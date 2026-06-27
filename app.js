let currentChatPartner = "";
let loggedInUser = "";
const localChatLogs = {};

const HF_SPACE_HOST = "zeegeedee-printermail-backend.hf.space"; 
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const socket = new WebSocket(`${protocol}//${HF_SPACE_HOST}/ws`);

socket.onopen = function() {
    console.log("[+] Connected! Welcome to the Python server.");
};

socket.onmessage = function(event) {
    let incomingText = event.data;

    if (incomingText.startsWith("{")) {
        try {
            let parsedData = JSON.parse(incomingText);
            if (parsedData.action === "search_results") {
                renderDiscoveredUsers(parsedData.results);
                return;
            }
            else if (parsedData.action === "incoming_friend_request") {
                let friendRequestConfirmationWindow = window.confirm(parsedData.sender + " sent a friend request! Accept?");

                if (friendRequestConfirmationWindow) {
                    socket.send(JSON.stringify({ "action": "accept_friend_request", "from_user": parsedData.sender }));
                    return;
                }
            }
            else if (parsedData.action === "load_history_results") {
                document.getElementById("chatHistory").innerHTML = "";
                parsedData.results.forEach(msg => {
                    let oldBubble = document.createElement("div");
                    let msgPrefix = "";
                    if (msg.sender === loggedInUser) {
                        msgPrefix = "You: "
                    }
                    else {
                        msgPrefix = msg.sender + ": "
                    }
                    oldBubble.innerText = msgPrefix + msg.message;
                    document.getElementById("chatHistory").appendChild(oldBubble);
                });
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
                    chatBubble.innerText = `${senderName}: ${textContent}`;
                    document.getElementById("chatHistory").appendChild(chatBubble);
                }
                return;
            }

        } catch (error) {
            console.error("[-] Failed to parse JSON:", error);
        }
    }

    if (incomingText === "[+] SUCCESS: Logged in!") {
        console.log("🔓 Login verified by Python! Booting messenger features...");

        loggedInUser = choiceName.value.toLowerCase().trim();

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
    else if (incomingText === "[+] SUCCESS: Account created! Please log in.") {
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

const searchResultsContainer = document.getElementById("searchResultsContainer");

function renderDiscoveredUsers(usersArray) {
    searchResultsContainer.innerHTML = "";
    usersArray.forEach(friend => {
        let userButton = document.createElement("button");
        let sendFriendRequestButton = document.createElement("button");
        userButton.innerText = friend.display_name;
        sendFriendRequestButton.innerText = "Send Friend Request 👥➕";
        
        userButton.addEventListener('click', function() {
            if (searchSection && searchSection.style.display === "block") {
                currentChatPartner = friend.username;
                document.getElementById("chatHistory").innerHTML = "";
                
                if (messagingSection && searchSection) {
                    messagingSection.style.display = "block";
                    searchSection.style.display = "none";
                }
                
                document.getElementById("chatHistory").innerHTML = "";
                let chatHistoryDataRequest = {
                    action: "request_chat_history",
                    target: friend.username
                }
                let jsonStringedChatHistoryDataRequest = JSON.stringify(chatHistoryDataRequest)
                socket.send(jsonStringedChatHistoryDataRequest)
                console.log(`Target recipient: ${currentChatPartner}`);
            }
        });
        
        sendFriendRequestButton.addEventListener('click', function(){
            if (searchSection && searchSection.style.display === "block") {
                socket.send(JSON.stringify({action: "send_friend_request", target: friend.username}));
            }
        });

        searchResultsContainer.appendChild(userButton);
        searchResultsContainer.appendChild(sendFriendRequestButton);
    });
}

function processInputs(event) {
    if (event) event.preventDefault();
    let generatedUUID = crypto.randomUUID();
    let numericTimestamp = Date.now();
    const messageBox = document.getElementById("messageInput");
    
    let messageValue = messageBox.value;
    let dataBundle = {
        action: "send_chat_message",
        message_id: generatedUUID,
        sender: loggedInUser,
        target: currentChatPartner,
        message: messageValue,
        timestamp: numericTimestamp
    };
    let jsonOutput = JSON.stringify(dataBundle);

    if (currentChatPartner !== "" && messageValue !== "") {
        if (!localChatLogs[currentChatPartner]){
            localChatLogs[currentChatPartner] = [];
        }
        localChatLogs[currentChatPartner].push(`You: ${messageValue}`);
        
        let chatBubble = document.createElement("div");
        chatBubble.innerText = `You: ${messageValue}`;
        document.getElementById("chatHistory").appendChild(chatBubble);
        
        socket.send(jsonOutput);
    }
    messageBox.value = "";
    console.log(jsonOutput);
}

const choiceDropdown = document.getElementById("authAction");
const choiceName = document.getElementById("authUsername");
const choicePassword = document.getElementById("authPassword");
const confirmPasswordLabel = document.getElementById("confirmPasswordLabel");
const choiceConfirmPassword = document.getElementById("authConfirmPassword");
const chooseDisplayNameLabel = document.getElementById("chooseDisplayNameLabel")
const choiceDisplayName = document.getElementById("authDisplayName")
const authErrorMessage = document.getElementById("authErrorMessage");

const sendButton = document.getElementById("sendMessageButton");
sendButton.addEventListener('click', processInputs);

const chatsModeButton = document.getElementById("chatsModeButton");
const searchModeButton = document.getElementById("searchModeButton");

const messagingSection = document.getElementById("messagingSection");
const searchSection = document.getElementById("searchSection");

if (chatsModeButton) {
    chatsModeButton.addEventListener('click', function() {
        messagingSection.style.display = "block";
        searchSection.style.display = "none";
        console.log("📱 Switched UI panel view to Messaging Mode.");
    });
}

if (searchModeButton) {
    searchModeButton.addEventListener('click', function() {
        messagingSection.style.display = "none";
        searchSection.style.display = "block";
        console.log("🔍 Switched UI panel view to User Search Mode.");
    });
}

choiceDropdown.addEventListener('change', function() {
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
    let authPassword =  choicePassword.value;
    let authConfirmPassword = choiceConfirmPassword.value;
    let authDisplayName = choiceDisplayName.value;

    if (authAction === "signup") {
        if (authPassword !== authConfirmPassword) {
            authErrorMessage.style.display = "block";
            authErrorMessage.innerText = "[-] Passwords do not match. Please check your typing.";
            return;
        }
        const authPackage = {"action": authAction, "display": authDisplayName, "user": authUsername, "pass": authPassword};
        const jsonStringedAuthPackage = JSON.stringify(authPackage);
        authErrorMessage.style.display = "none";
        socket.send(jsonStringedAuthPackage);
    }
    else if (authAction === "login") {
        const loginPackage = {"action": authAction, "user": authUsername, "pass": authPassword};
        const jsonStringedLoginPackage = JSON.stringify(loginPackage);
        socket.send(jsonStringedLoginPackage);
    }
}

const submitAuthCredentials = document.getElementById("authSubmitButton");
submitAuthCredentials.addEventListener('click', runAuthVerification);

const userSearchInput = document.getElementById("userSearchInput");
if (userSearchInput) {
    userSearchInput.addEventListener('input', function() {
        let typedText = userSearchInput.value.trim();
        if (typedText.length === 0) {
            searchResultsContainer.innerHTML = "";
            return;
        }
        let searchPayload = {
            "action": "search",
            "query": typedText
        };
        socket.send(JSON.stringify(searchPayload));
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
