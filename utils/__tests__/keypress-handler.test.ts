import { renderHook, act, fireEvent } from '@testing-library/react';
import { useKeyPress } from '../keypress-handler';

describe('useKeyPress Hook', () => {
  it('should return false initially before any key is pressed', () => {
    const { result } = renderHook(() => useKeyPress('Enter'));
    expect(result.current).toBe(false);
  });

  it('should return true when the target key is pressed down', () => {
    const { result } = renderHook(() => useKeyPress('a'));

    act(() => {
      fireEvent.keyDown(window, { key: 'a' });
    });

    expect(result.current).toBe(true);
  });

  it('should return to false when the target key is released', () => {
    const { result } = renderHook(() => useKeyPress('Shift'));

    act(() => {
      fireEvent.keyDown(window, { key: 'Shift' });
    });
    expect(result.current).toBe(true);

    act(() => {
      fireEvent.keyUp(window, { key: 'Shift' });
    });
    expect(result.current).toBe(false);
  });

  it('should not change state when a non-target key is pressed', () => {
    const { result } = renderHook(() => useKeyPress('Enter'));

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(result.current).toBe(false);
  });

  it('should correctly add and remove event listeners', () => {
    const addEventSpy = jest.spyOn(window, 'addEventListener');
    const removeEventSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useKeyPress('anyKey'));

    expect(addEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(addEventSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
    
    unmount();

    expect(removeEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeEventSpy).toHaveBeenCalledWith('keyup', expect.any(Function));

    addEventSpy.mockRestore();
    removeEventSpy.mockRestore();
  });
});