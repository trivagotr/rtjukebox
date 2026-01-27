# RadioTEDU Jukebox Project

**RadioTEDU Jukebox** is a comprehensive school radio and interactive music selection system designed for campus environments. It empowers students to listen to live radio, access podcasts, and democratically choose music in common areas (like the cafeteria/restaurant) using a QR-code-based voting system.

![RadioTEDU Jukebox Logo](logo-03byz-scaled.png)

## 🚀 Features

This project is a "Superapp" comprising multiple modules:

### 📱 Mobile App (iOS & Android)
The central hub for students & listeners.
*   **Live Radio**: Listen to the school radio stream with background playback and lock screen controls.
*   **Podcasts**: Browse and listen to school podcasts (fetched from WordPress/RSS).
*   **Juicebox Controller**: Scan a QR code in the cafeteria to join the active "Session".
*   **Voting System**: Add songs to the queue, Upvote your favorites, and Downvote tracks you want to skip.
*   **Ranking**: Earn points for good song selections and climb the user leaderboard.

### 🎵 Jukebox Kiosk
Running on an Android tablet or screen in the cafeteria.
*   **Now Playing**: Displays the current song and upcoming queue.
*   **QR Code**: Dynamic QR code for students to scan and join.
*   **Smart Queue**: Prioritizes songs based on votes, user rank, and wait time. abuse prevention included.

### 🖥️ Management & Web Controller
*   **Web Dashboard**: For managing the system, song catalog, and monitoring active sessions.

## 🏗️ Technical Architecture

The project is structured into several key components:

| Component | Path | Technology Stack | Description |
| :--- | :--- | :--- | :--- |
| **Backend** | `rtjukebox-main/backend` | Node.js, TypeScript, Express, PostgreSQL | The core API handling auth, voting logic, queue management, and radio streams. |
| **Mobile App** | `rtjukebox-main/mobile` | React Native | Cross-platform mobile application for end-users. |
| **Kiosk Web** | `rtjukebox-main/kiosk-web` | HTML/JS (Legacy/Simple) | Simple web interface for the kiosk display (likely superseded by the mobile app's kiosk mode). |
| **Web Controller** | `rtjukebox-main/jukebox-web-controller` | React, Vite | Web-based admin or control dashboard. |

### Directory Structure

```text
📦 rtjukebox-main
 ┣ 📂 backend                 # Node.js API Server
 ┃ ┣ 📂 src
 ┃ ┃ ┣ 📂 routes              # API Endpoints (auth, jukebox, radio)
 ┃ ┃ ┗ 📂 services            # Business logic (Queue algorithm, Push notifications)
 ┃ ┗ 📜 package.json
 ┣ 📂 mobile                  # React Native User App
 ┃ ┣ 📂 src
 ┃ ┃ ┗ 📂 screens             # UI Screens (Jukebox, Radio, Profile)
 ┃ ┗ 📜 package.json
 ┣ 📂 kiosk-web               # Simple Kiosk Display (Web)
 ┣ 📂 jukebox-web-controller  # Admin/Controller Dashboard
 ┗ 📜 Kiosk App Setup & Build.md # Detailed setup documentation
```

## 🌍 Open Source Usage Policy

This project is open to everyone! You are free to use, modify, and deploy this system for your own school or community.

**Requirement:**
> **You must include a visible reference to "RadioTEDU" in your deployment.**
> This project was originally developed for RadioTEDU, and we appreciate the credit.

*For setup and deployment instructions, please refer to the internal documentation or contact the maintainers.*

## 🤝 Contributing

1.  Fork the repository.
2.  Create a feature branch.
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.

## 📄 License

[License Information Here]

---
*Generated based on codebase analysis of `rtjukebox-main`.*
