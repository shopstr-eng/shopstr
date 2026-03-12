import { useEffect, useState } from "react";

export const useKeyPress = (targetKey: unknown) => {
  const [keyPressed, setKeyPressed] = useState(false);

  useEffect(() => {
    const downHandler = ({ key }: { key: unknown }) => {
      if (key === targetKey) {
        setKeyPressed(true);
        return;
      }
    };

    const upHandler = ({ key }: { key: unknown }) => {
      if (key === targetKey) {
        setKeyPressed(false);
        return;
      }
    };

    window.addEventListener("keydown", downHandler);
    window.addEventListener("keyup", upHandler);

    return () => {
      window.removeEventListener("keydown", downHandler);
      window.removeEventListener("keyup", upHandler);
    };
  }, [targetKey]);

  return keyPressed;
};
