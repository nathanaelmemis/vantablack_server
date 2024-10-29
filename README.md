# Vantablack

## Overview
Vantablack is an anonymized encrypted messaging web app. It utilizes Sha256 for hashing and AES for encryption.

## Features
- Creating and joining of rooms.
- Automatic destroying of rooms in given time limit or inactive days limit.
- End-to-end encryption.
- Realtime messaging.

## Tech Stack
- **Frontend:** React.js
- **Backend:** Node.js, Express.js
- **Database:** Firbase Realtime Database
- **Deployment:**
    - **Frontend:** Deployed on Github Pages
    - **Backend:** Deployed on Vercel

## Website
[nathanaelmemis.github.io/vantablack/](https://nathanaelmemis.github.io/vantablack/)

## Installation and Setup 
To run this project locally, follow these steps:

### Prerequisites
- Node.js
- Firebase Realtime Database

### Installation
1. **Clone the repository:**
    ```
    git clone https://github.com/nathanaelmemis/vantablack.git
    ```
2. **Navigate to the project directory:**
    ```
    cd vantablack
    ```
3. **Install the dependencies:**
    ```
    npm install
4. **Set up your Firebase Admin SDK details:**
    - Place your generated Firebase Admin SDK private key JSON file under `server/` directory.
    - Copy all fields, except the `private_key` field, from the Firebase Admin SDK JSON file to the serviceAccount variable in `server/server.js`. 
    - This leaves your Firebase Admin SDK private key JSON file as such:
        ```
        {"private_key":"your_private_key"}
        ```
5. **Start the development server:**
    ```
    cd server && npm run dev
    ```