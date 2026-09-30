import { useState } from "react";
import { Link } from "react-router-dom";

function ForgotPasswordCard() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [sending, setSending] = useState(false);

  async function handleForgotPassword() {
    setMessage("");
    setError("");
    setResetUrl("");
    setSending(true);

    try {
      const response = await fetch("http://localhost:3000/forgotPassword", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to generate reset link");
      }

      setMessage(data.message);
      setResetUrl(data.resetUrl || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="auth-page">
      <h1 className="greet">Forgot Your Password?</h1>

      <input
        className={error ? "input-error" : "identifier"}
        type="email"
        placeholder="Enter Your Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      {error && <p className="error-message">{error}</p>}
      {message && <p className="success-message">{message}</p>}

      {resetUrl && (
        <a className="reset-link" href={resetUrl}>
          Open Reset Link
        </a>
      )}

      <button
        className="submit-btn"
        onClick={handleForgotPassword}
        disabled={sending || !email.trim()}
      >
        {sending ? "Sending…" : "Send Reset Link"}
      </button>

      <Link to="/login">Back to Login</Link>
    </div>
  );
}

export default ForgotPasswordCard;
