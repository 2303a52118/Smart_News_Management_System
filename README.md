# 📰 Smart News Management System

## 📌 About the Project

Smart News Management System is a full-stack web application designed to manage and deliver news content efficiently. It integrates Machine Learning to provide personalized news recommendations based on article content and user reading history.

The platform supports multiple user roles, allowing administrators, editors, content creators, and readers to interact with news content through a centralized application.

## 🎯 Objectives

- Build a complete full-stack news management platform.
- Provide personalized news recommendations using Machine Learning.
- Implement secure authentication and role-based access control.
- Simplify news publishing and content management.
- Deploy application services using Docker and Kubernetes.

## ✨ Key Features

- User registration and login.
- JWT-based authentication.
- Role-based access control.
- News article creation, editing, and publishing.
- Category management.
- Article image uploads.
- Article likes and views.
- Personalized news recommendations.
- Reading-history-based recommendations.
- Popularity-based fallback recommendations.
- Responsive user interface.
- RESTful API integration.

## 🤖 Machine Learning Implementation

The project includes a separate Python-based recommendation service.

**Algorithms and techniques:**

- TF-IDF (Term Frequency-Inverse Document Frequency).
- Cosine Similarity.
- Content-based recommendation.
- Reading-history-based personalization.
- Popularity-based fallback recommendation.

**Recommendation workflow:**

1. Collect article information.
2. Convert article text into numerical TF-IDF vectors.
3. Calculate cosine similarity between articles and user interests.
4. Rank relevant articles.
5. Return recommended news articles to the frontend.

If the ML service is unavailable, the backend provides popular unread articles as recommendations.

## 🛠️ Technologies Used

**Frontend**
- React.js
- JavaScript
- Vite
- CSS
- Axios

**Backend**
- Node.js
- Express.js
- REST APIs

**Database**
- MongoDB
- Mongoose

**Machine Learning**
- Python
- FastAPI
- Scikit-learn
- TF-IDF
- Cosine Similarity

**Authentication and Security**
- JSON Web Token (JWT)
- bcryptjs
- Role-based authorization

**DevOps and Deployment**
- Docker
- Docker Compose
- Kubernetes
- Render deployment configuration

## 🏗️ Application Architecture

React Frontend → Express Backend → MongoDB Database

The backend communicates with the separate Python FastAPI recommendation service to generate personalized news recommendations.

## 👥 User Roles

| Role | Responsibilities |
|---|---|
| Admin | Manage users, categories, and application content |
| Editor | Manage and review news content |
| Content Creator | Create and manage articles |
| Reader | Read articles and receive recommendations |

## 📂 Project Modules

1. Authentication and User Management
2. News Article Management
3. Category Management
4. Image Upload Management
5. Machine Learning Recommendation Service
6. Reader Dashboard
7. Admin and Content Management
8. Docker and Kubernetes Deployment

## ⚙️ Installation and Execution

### Clone the Repository

```bash
git clone https://github.com/2303a52118/Smart_News_Management_System.git
cd Smart_News_Management_System
```

### Backend

```bash
cd backend
npm install
npm start
```

Configure the required environment variables in the backend `.env` file.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Machine Learning Service

```bash
cd ml-service
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Make sure MongoDB is running and the backend and ML service environment variables are configured.

## 🐳 Docker Execution

Run the application from the project root:

```bash
docker compose up --build -d
```

Check running containers:

```bash
docker compose ps
```

Stop containers:

```bash
docker compose down
```

## ☸️ Kubernetes

Apply the Kubernetes configuration:

```bash
kubectl apply -f k8s/
```

Check application resources:

```bash
kubectl get all -n smart-news
```

## 🧪 Testing

The project includes automated tests for the backend, frontend, and ML service.

| Component | Passed Tests |
|---|---:|
| Backend | 60 |
| Frontend | 3 |
| ML Service | 15 |
| **Total** | **78** |

## 🚀 Future Enhancements

- Improve recommendation personalization.
- Add real-time breaking news notifications.
- Integrate external news APIs.
- Add advanced analytics dashboards.
- Improve image storage using cloud object storage.
- Implement production monitoring and logging.

## 👨‍💻 Developer

**Pochampally Sravan**

B.Tech Computer Science and Engineering (AI & ML)  
SR University, Telangana

GitHub: https://github.com/2303a52118

## 📄 License

This project is developed for academic and learning purposes.
