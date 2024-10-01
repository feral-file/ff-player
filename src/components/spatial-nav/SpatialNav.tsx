import React, { useEffect } from 'react';
import styles from './styles.module.scss';
import { init, useFocusable } from '@noriginmedia/norigin-spatial-navigation';

const SpatialNav = () => {
  useEffect(() => {
    return init({
      debug: true,
      visualDebug: true,
    });
  }, []);

  return (
    <div
      className="button-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px',
        width: '200px',
        margin: '50px auto',
      }}>
      <FocusableButton id="btnA">A</FocusableButton>
      <FocusableButton id="btnB">B</FocusableButton>
      <FocusableButton id="btnC">C</FocusableButton>
      <FocusableButton id="btnD">D</FocusableButton>
    </div>
  );
};

const FocusableButton: React.FC<{ id: string; children: React.ReactNode }> = ({
  id,
  children,
}) => {
  const { ref, focused } = useFocusable();

  return (
    <button
      ref={ref}
      id={id}
      className={focused ? styles.focusedButton : styles.buttonStyle}>
      {children}
    </button>
  );
};

export default SpatialNav;
