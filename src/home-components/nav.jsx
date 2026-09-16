import SearchBar from "./navBar/searchbar";
import ProfileIcon from "./navBar/profileIcon";
import HomeBtn from "./navBar/home";
import "../styling/nav.css";
function Nav() {
  return (
    <nav>
      <HomeBtn />
      <SearchBar />
      <ProfileIcon />
    </nav>
  );
}
export default Nav;
