import { StaffAssignmentDirectory } from "./pages/StaffAssignmentDirectory";
import { StaffTrainers } from "./pages/StaffTrainers";
import { StaffReports } from "./pages/StaffReports";
import {
  StaffAssessments,
  StaffAssessmentEditor,
} from "./pages/StaffAssessments";
import { StaffStudents, StaffStudentDetails } from "./pages/StaffStudents";
import { StaffBatches, StaffBatchDetails } from "./pages/StaffBatches";
import { Companies, CompanyPreparation } from "./pages/Companies";
import { Learning, LearningReader } from "./pages/Learning";
import { LearningManage, LearningEditor } from "./pages/LearningManage";
import {
  CodingProblems,
  CodingChallenge,
  CodingHistory,
} from "./pages/CodingProblems";
import { CodingWorkspace } from "./pages/CodingWorkspace";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { StaffDashboard } from "./pages/StaffDashboard";
import { AuthProvider } from "./features/auth/AuthProvider";
import { ProtectedRoute } from "./features/auth/ProtectedRoute";
import "./styles.css";
import { StudentDashboard } from "./pages/StudentDashboard";
import { Resumes } from "./pages/Resumes";
import { ResumeEditor } from "./pages/ResumeEditor";
import { ResumeAnalyzer } from "./pages/ResumeAnalyzer";
import { Interviews } from "./pages/Interviews";
import { InterviewChat } from "./pages/InterviewChat";
import { Assessments } from "./pages/Assessments";
import { AssessmentInstructions } from "./pages/AssessmentInstructions";
import { AssessmentAttempt } from "./pages/AssessmentAttempt";
import { AssessmentAnalytics } from "./pages/AssessmentAnalytics";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3"
        >
          Skip to main content
        </a>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute role="student" />}>
            <Route path="/dashboard/student" element={<StudentDashboard />} />
            <Route path="/resumes" element={<Resumes />} />
            <Route path="/resumes/new" element={<ResumeEditor />} />
            <Route path="/resumes/:id" element={<ResumeEditor />} />
            <Route path="/resume-analyzer" element={<ResumeAnalyzer />} />
            <Route path="/interviews" element={<Interviews />} />
            <Route path="/interviews/:id" element={<InterviewChat />} />
            <Route path="/assessments" element={<Assessments />} />
            <Route
              path="/assessments/:id"
              element={<AssessmentInstructions />}
            />
            <Route path="/attempts/:id" element={<AssessmentAttempt />} />
            <Route path="/analytics" element={<AssessmentAnalytics />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/companies/:id" element={<CompanyPreparation />} />
            <Route path="/coding" element={<CodingWorkspace />} />
            <Route path="/coding/problems" element={<CodingProblems />} />
            <Route path="/coding/problems/:id" element={<CodingChallenge />} />
            <Route path="/coding/submissions" element={<CodingHistory />} />
            <Route path="/learning" element={<Learning />} />
            <Route path="/learning/:id" element={<LearningReader />} />
          </Route>
          {(["trainer", "admin"] as const).map((role) => (
            <Route key={role} element={<ProtectedRoute role={role} />}>
              <Route
                path={`/manage/${role}/assessments`}
                element={<StaffAssessments role={role} />}
              />
              <Route
                path={`/manage/${role}/assessments/:id`}
                element={<StaffAssessmentEditor role={role} />}
              />
              <Route
                path={`/manage/${role}/reports`}
                element={<StaffReports role={role} />}
              />
              <Route
                path={`/manage/${role}/assignments`}
                element={<StaffAssignmentDirectory role={role} />}
              />
              <Route
                path={`/manage/${role}/students`}
                element={<StaffStudents role={role} />}
              />
              <Route
                path={`/manage/${role}/students/:id`}
                element={<StaffStudentDetails role={role} />}
              />
              <Route
                path={`/manage/${role}/batches`}
                element={<StaffBatches role={role} />}
              />
              <Route
                path={`/manage/${role}/batches/:id`}
                element={<StaffBatchDetails role={role} />}
              />
              {role === "admin" && (
                <Route
                  path="/manage/admin/trainers"
                  element={<StaffTrainers />}
                />
              )}
              <Route
                path={`/dashboard/${role}`}
                element={<StaffDashboard role={role} />}
              />
              <Route
                path={`/learning/manage/${role}`}
                element={<LearningManage />}
              />
              <Route
                path={`/learning/manage/${role}/:id`}
                element={<LearningEditor />}
              />
            </Route>
          ))}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
