import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function SignUpCard() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFailed, setPasswordFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [emailFailed, setEmailFailed] = useState(false);
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async () => {
    setFailed(false);
    setPasswordFailed(false);
    setEmailFailed(false);
    setServerError("");
    setSaving(true);

    try {
      const response = await fetch("http://localhost:3000/signUpPage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password, confirmPassword }),
      });

      if (response.status === 409) {
        setFailed(true);
      } else if (response.status === 400) {
        setPasswordFailed(true);
      } else if (response.status === 422) {
        setEmailFailed(true);
      } else if (response.ok) {
        navigate("/login", {
          replace: true,
          state: { success: "Account created successfully. You can now log in." },
        });
      } else {
        setServerError("Something went wrong. Please try again.");
      }
    } catch (error) {
      console.error("Network error:", error);
      setServerError("Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-page">
      <h1 className="greet">Create Your Account</h1>
      <input
        className="identifier"
        type="text"
        placeholder="Choose a Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      {failed && <p className="error-message">UserName is already taken.</p>}
      <input
        className="identifier"
        type="email"
        placeholder="Enter Your Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {emailFailed && (
        <p className="error-message">Please enter a valid email.</p>
      )}
      <input
        type="password"
        placeholder="Create a Password"
        className="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        type="password"
        placeholder="Confirm Password"
        className="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      {passwordFailed && (
        <p className="error-message">Make sure that your passwords match.</p>
      )}
      {serverError && <p className="error-message">{serverError}</p>}
      <button className="submit-btn" onClick={handleSignUp} disabled={saving}>
        {saving ? "Creating…" : "Sign Up"}
      </button>
      <Link to="/login">Already have an account? Log In</Link>
    </div>
  );
}

export default SignUpCard;
