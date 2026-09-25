import SearchBar from "./navBar/searchbar";
import ProfileIcon from "./navBar/profileIcon";
import HomeBtn from "./navBar/home";
import "../styling/nav.css";
function Nav({setSelectedPlaylist}) {
  return (
    <nav>
      <HomeBtn setSelectedPlaylist={setSelectedPlaylist}/>
      <SearchBar />
      <ProfileIcon />
    </nav>
  );
}
export default Nav;
