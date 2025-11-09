/**
 * GashoTech Chat Widget
 * A theme-aware chat widget for providing information about the website
 */

class ChatWidget {
    constructor() {
        this.isOpen = false;
        this.hasShownWelcome = false;
        this.init();
    }

    init() {
        this.createWidget();
        this.attachEventListeners();
        this.loadChatState();
    }

    createWidget() {
        const widgetHTML = `
            <div class="chat-widget" id="chatWidget">
                <div class="chat-window" id="chatWindow">
                    <div class="chat-header">
                        <div class="chat-header-info">
                            <div class="chat-header-icon">💬</div>
                            <div class="chat-header-text">
                                <h3 class="chat-header-title">GashoTech Assistant</h3>
                                <p class="chat-header-status">Online</p>
                            </div>
                        </div>
                        <button class="chat-close" id="chatClose" aria-label="Close chat">×</button>
                    </div>
                    <div class="chat-messages" id="chatMessages"></div>
                    <div class="quick-replies" id="quickReplies"></div>
                    <div class="chat-input-container">
                        <input type="text" class="chat-input" id="chatInput" placeholder="Type your message..." aria-label="Type your message">
                        <button class="chat-send" id="chatSend" aria-label="Send message">➤</button>
                    </div>
                </div>
                <button class="chat-button" id="chatButton" aria-label="Open chat">
                    💬
                    <span class="chat-badge" id="chatBadge" style="display: none;">1</span>
                </button>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', widgetHTML);
        this.widget = document.getElementById('chatWidget');
        this.chatButton = document.getElementById('chatButton');
        this.chatWindow = document.getElementById('chatWindow');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.chatSend = document.getElementById('chatSend');
        this.chatClose = document.getElementById('chatClose');
        this.quickReplies = document.getElementById('quickReplies');
        this.chatBadge = document.getElementById('chatBadge');
    }

    attachEventListeners() {
        this.chatButton.addEventListener('click', () => this.toggleChat());
        this.chatClose.addEventListener('click', () => this.closeChat());
        this.chatSend.addEventListener('click', () => this.sendMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Close chat when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.widget.contains(e.target)) {
                this.closeChat();
            }
        });

        // Prevent chat window from closing when clicking inside
        this.chatWindow.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    toggleChat() {
        if (this.isOpen) {
            this.closeChat();
        } else {
            this.openChat();
        }
    }

    openChat() {
        this.isOpen = true;
        this.chatWindow.classList.add('active');
        this.chatButton.style.display = 'none';
        this.hideBadge();

        // Show welcome message if not already shown
        if (!this.hasShownWelcome) {
            setTimeout(() => {
                this.showWelcomeMessage();
                this.hasShownWelcome = true;
                this.saveChatState();
            }, 500);
        }

        this.chatInput.focus();
    }

    closeChat() {
        this.isOpen = false;
        this.chatWindow.classList.remove('active');
        this.chatButton.style.display = 'flex';
        this.saveChatState();
    }

    showWelcomeMessage() {
        const welcomeMessage = `
            <div class="chat-message bot welcome-message">
                <div class="message-bubble">
                    <strong>Welcome to GashoTech! 👋</strong><br><br>
                    I'm your AI assistant. I can help you learn about:<br>
                    • Our AI and automation solutions<br>
                    • Cybersecurity services<br>
                    • ICT offerings<br>
                    • Company information<br>
                    • Getting in touch with us<br><br>
                    <strong>💡 Not sure what to ask? Try these popular topics:</strong>
                </div>
                <div class="message-time">${this.getCurrentTime()}</div>
            </div>
        `;

        this.chatMessages.insertAdjacentHTML('beforeend', welcomeMessage);
        this.scrollToBottom();
        this.showGuideTopics();
    }

    showQuickReplies() {
        const replies = [
            'What services do you offer?',
            'Tell me about AI solutions',
            'How can I contact you?',
            'What is cybersecurity?'
        ];

        this.quickReplies.innerHTML = replies.map(reply => `
            <button class="quick-reply" data-message="${reply}">${reply}</button>
        `).join('');

        // Add click handlers for quick replies
        this.quickReplies.querySelectorAll('.quick-reply').forEach(button => {
            button.addEventListener('click', () => {
                const message = button.getAttribute('data-message');
                this.chatInput.value = message;
                this.sendMessage();
            });
        });
    }

    showGuideTopics() {
        const guideTopics = [
            {
                category: '🚀 Services',
                topics: [
                    'List all services',
                    'AI solutions info',
                    'Cybersecurity details'
                ]
            },
            {
                category: '💼 Company',
                topics: [
                    'About GashoTech',
                    'Company location',
                    'Contact information'
                ]
            },
            {
                category: '💰 Pricing',
                topics: [
                    'How much does it cost?',
                    'Free consultation',
                    'Custom quotes'
                ]
            },
            {
                category: '🎓 Learning',
                topics: [
                    'What is AI?',
                    'Cybersecurity basics',
                    'Automation benefits'
                ]
            }
        ];

        let guideHTML = '<div class="guide-categories">';
        guideTopics.forEach(category => {
            guideHTML += `
                <div class="guide-category">
                    <div class="guide-category-title">${category.category}</div>
                    <div class="guide-topics">
                        ${category.topics.map(topic => `
                            <button class="quick-reply guide-topic" data-message="${topic}">${topic}</button>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        guideHTML += '</div>';

        this.quickReplies.innerHTML = guideHTML;

        // Add click handlers for guide topics
        this.quickReplies.querySelectorAll('.guide-topic').forEach(button => {
            button.addEventListener('click', () => {
                const message = button.getAttribute('data-message');
                this.chatInput.value = message;
                this.sendMessage();
            });
        });
    }

    clearQuickReplies() {
        this.quickReplies.innerHTML = '';
    }

    sendMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;

        // Display user message
        this.addMessage(message, 'user');
        this.chatInput.value = '';

        // Show typing indicator
        this.showTypingIndicator();

        // Process message and get response
        setTimeout(() => {
            this.hideTypingIndicator();
            const response = this.getResponse(message);
            this.addMessage(response, 'bot');
            this.scrollToBottom();
        }, 1000);
    }

    addMessage(message, sender) {
        const messageHTML = `
            <div class="chat-message ${sender}">
                <div class="message-bubble">${message}</div>
                <div class="message-time">${this.getCurrentTime()}</div>
            </div>
        `;

        this.chatMessages.insertAdjacentHTML('beforeend', messageHTML);
        this.scrollToBottom();
    }

    getResponse(message) {
        const lowerMessage = message.toLowerCase();

        // Company Information
        if (lowerMessage.includes('about') || lowerMessage.includes('company') || lowerMessage.includes('who are you')) {
            return `
                <strong>About GashoTech</strong><br><br>
                GashoTech is a cutting-edge AI startup based in Nairobi, Kenya. We specialize in:
                <br>• Artificial Intelligence solutions
                <br>• Automation systems
                <br>• Advanced cybersecurity
                <br>• ICT services
                <br><br>
                Our mission is to drive innovation and efficiency in business through intelligent automation and AI-powered solutions.
            `;
        }

        // Services
        if (lowerMessage.includes('service') || lowerMessage.includes('what do you do')) {
            return `
                <strong>Our Services Include:</strong><br><br>
                🤖 <strong>AI Solutions</strong> - Custom AI systems for automation and decision-making<br>
                ⚡ <strong>AI Automation</strong> - Streamline tasks and boost productivity<br>
                🔒 <strong>Cybersecurity</strong> - AI-driven threat detection and protection<br>
                ☁️ <strong>ICT Services</strong> - Infrastructure, cloud, and IT consulting<br>
                💻 <strong>Computer Services</strong> - Hardware and software support<br>
                🌐 <strong>Network & Data</strong> - Database design and network solutions<br><br>
                Which service interests you?
            `;
        }

        // AI Solutions
        if (lowerMessage.includes('ai') || lowerMessage.includes('artificial intelligence') || lowerMessage.includes('machine learning')) {
            return `
                <strong>AI Solutions at GashoTech</strong><br><br>
                Our AI services include:<br>
                • Natural Language Processing (NLP)<br>
                • Machine Learning algorithms<br>
                • Predictive analytics<br>
                • Process automation<br>
                • Decision-making systems<br><br>
                We tailor AI solutions to meet your specific business needs. Would you like to schedule a consultation?
            `;
        }

        // Automation
        if (lowerMessage.includes('automation') || lowerMessage.includes('automate')) {
            return `
                <strong>AI Automation Services</strong><br><br>
                We help businesses automate:<br>
                • Repetitive manual tasks<br>
                • Data processing workflows<br>
                • Customer service (chatbots)<br>
                • Business processes<br>
                • Document handling<br><br>
                Our automation solutions reduce errors, save time, and increase productivity. Need more details?
            `;
        }

        // Cybersecurity
        if (lowerMessage.includes('security') || lowerMessage.includes('cyber') || lowerMessage.includes('protection')) {
            return `
                <strong>Cybersecurity Solutions</strong><br><br>
                Our cybersecurity services provide:<br>
                • AI-driven threat detection<br>
                • Risk assessment & management<br>
                • Data protection strategies<br>
                • Security audits<br>
                • Incident response planning<br>
                • 24/7 monitoring<br><br>
                Protecting your digital assets is our top priority. Contact us for a security assessment.
            `;
        }

        // ICT Services
        if (lowerMessage.includes('ict') || lowerMessage.includes('infrastructure') || lowerMessage.includes('cloud')) {
            return `
                <strong>ICT Services</strong><br><br>
                We offer comprehensive ICT solutions:<br>
                • Cloud computing solutions<br>
                • Infrastructure management<br>
                • Software development<br>
                • IT consulting<br>
                • System integration<br>
                • Technical support<br><br>
                Scalable solutions to help your business succeed in the digital age.
            `;
        }

        // Contact Information
        if (lowerMessage.includes('contact') || lowerMessage.includes('phone') || lowerMessage.includes('email') || lowerMessage.includes('reach')) {
            return `
                <strong>Contact GashoTech</strong><br><br>
                📍 <strong>Location:</strong> Nairobi, Kenya<br>
                📞 <strong>Phone:</strong> +254 792329179 / +254 788467652<br>
                📧 <strong>Email:</strong> gashotech@gmail.com<br><br>
                <strong>Follow us:</strong><br>
                Facebook: /gashotech<br>
                Twitter: @gashotech<br>
                LinkedIn: /company/gashotech<br><br>
                We're here to help! Feel free to reach out.
            `;
        }

        // Location
        if (lowerMessage.includes('where') || lowerMessage.includes('location') || lowerMessage.includes('kenya')) {
            return `
                <strong>Our Location</strong><br><br>
                GashoTech is proudly based in Nairobi, Kenya.<br><br>
                🇰🇪 Serving clients locally and globally with cutting-edge technology solutions.<br><br>
                We combine local expertise with international standards to deliver exceptional results.
            `;
        }

        // Pricing/Cost
        if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('pricing') || lowerMessage.includes('quote')) {
            return `
                <strong>Pricing & Consultation</strong><br><br>
                Our pricing is customized based on your specific needs and requirements.<br><br>
                We offer:<br>
                • Free initial consultation<br>
                • Custom quotes for all services<br>
                • Flexible payment plans<br>
                • Competitive rates<br><br>
                Contact us for a personalized quote tailored to your project!
            `;
        }

        // Portfolio/Projects
        if (lowerMessage.includes('portfolio') || lowerMessage.includes('project') || lowerMessage.includes('work') || lowerMessage.includes('case study')) {
            return `
                <strong>Our Work</strong><br><br>
                We've successfully delivered AI and cybersecurity solutions to various clients.<br><br>
                Visit our <a href="#portfolio" style="color: var(--chat-primary); text-decoration: underline;">Portfolio section</a> to see some of our featured projects and success stories.<br><br>
                We also have blogs covering hacking, cracking, and tech news!
            `;
        }

        // Greeting responses
        if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey') || lowerMessage.includes('good morning') || lowerMessage.includes('good afternoon')) {
            const greetings = [
                "Hello! How can I help you learn about GashoTech today?",
                "Hi there! Ready to explore our AI and cybersecurity solutions?",
                "Welcome! What would you like to know about our services?"
            ];
            return greetings[Math.floor(Math.random() * greetings.length)];
        }

        // Thank you responses
        if (lowerMessage.includes('thank') || lowerMessage.includes('thanks')) {
            const thanks = [
                "You're welcome! Is there anything else you'd like to know?",
                "Happy to help! Feel free to ask if you have more questions.",
                "Anytime! We're here to support your tech journey."
            ];
            return thanks[Math.floor(Math.random() * thanks.length)];
        }

        // Default response
        return `
            I'd be happy to help! You can ask me about:<br>
            • Our services (AI, automation, cybersecurity, ICT)<br>
            • Company information<br>
            • Contact details<br>
            • Pricing and consultations<br><br>
            Or simply type what you're looking for, and I'll do my best to assist you!
        `;
    }

    showTypingIndicator() {
        const typingHTML = `
            <div class="chat-message bot" id="typingIndicator">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        this.chatMessages.insertAdjacentHTML('beforeend', typingHTML);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    getCurrentTime() {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    showBadge() {
        this.chatBadge.style.display = 'flex';
    }

    hideBadge() {
        this.chatBadge.style.display = 'none';
    }

    saveChatState() {
        const state = {
            hasShownWelcome: this.hasShownWelcome,
            timestamp: Date.now()
        };
        localStorage.setItem('chatWidgetState', JSON.stringify(state));
    }

    loadChatState() {
        const saved = localStorage.getItem('chatWidgetState');
        if (saved) {
            try {
                const state = JSON.parse(saved);
                // Show badge if chat state is less than 24 hours old
                const hoursPassed = (Date.now() - state.timestamp) / (1000 * 60 * 60);
                if (hoursPassed < 24) {
                    this.hasShownWelcome = state.hasShownWelcome;
                    if (!this.hasShownWelcome) {
                        this.showBadge();
                    }
                }
            } catch (e) {
                console.error('Error loading chat state:', e);
            }
        }
    }
}

// Initialize the chat widget when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ChatWidget();
});

// Export for use in other scripts if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatWidget;
}
