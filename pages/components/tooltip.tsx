const Tooltip = ({ content, children }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <div className="relative inline-block">
      <div
        className={`${
          showTooltip ? "block" : "hidden"
        } bg-gray-800 text-white text-xs rounded-md py-1 px-2 absolute z-10`}
      >
        {content}
      </div>
      <div
        className="inline-block rounded-md cursor-pointer"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {children}
      </div>
    </div>
  );
};

export default Tooltip;