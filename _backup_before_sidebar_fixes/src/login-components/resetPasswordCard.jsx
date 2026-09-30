import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

function ResetPasswordCard() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  async function handleReset() {
    setError("");

    if (!token) {
      setError("This reset link is invalid.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("http://localhost:3000/resetPassword", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to reset password");
      }

      navigate("/login", {
        replace: true,
        state: { success: "Password reset successfully. You can now log in." },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-page">
      <h1 className="greet">Reset Your Password</h1>

      {!token && <p className="error-message">This reset link is invalid.</p>}

      <input
        className={error ? "input-error" : "password"}
        type="password"
        placeholder="New Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <input
        className={error ? "input-error" : "password"}
        type="password"
        placeholder="Confirm New Password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />

      {error && <p className="error-message">{error}</p>}

      <button className="submit-btn" onClick={handleReset} disabled={saving || !token}>
        {saving ? "Resetting…" : "Reset Password"}
      </button>
    </div>
  );
}

export default ResetPasswordCard;
