import styles from "./exhibition.module.scss";

import ExhibitionHall from "./exhibitionPlayer";

const ExhibitionPage = () => {
  return (
    <div className={styles.mainContainer}>
     <ExhibitionHall />
    </div>
  );
}

export default ExhibitionPage;
