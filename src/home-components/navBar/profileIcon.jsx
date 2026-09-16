function ProfileIcon({ iconUrl }) {
  return (
    <button className="profileBtn">
      <img
        src={iconUrl || "https://ui-avatars.com/api/?name=User&background=random"}
        alt="Profile"
      />
    </button>
  );
}
export default ProfileIcon;