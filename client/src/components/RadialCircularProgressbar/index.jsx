import { CircularProgressbarWithChildren, buildStyles } from 'react-circular-progressbar';
import RadialSeparators from './RadialSeparators';

export const RadialCircularProgressbar = (props) => {
  const {
    value,
    rootStyles: { pathColor, textColor, glowColor },
    radialSeparatorStyles,
    count
  } = props;
  const text = `${parseFloat(value).toFixed(2)}%`;

  return (
    <CircularProgressbarWithChildren
      value={value}
      text={text}
      styles={{
        root: { filter: glowColor },
        path: { stroke: pathColor },
        text: { fill: textColor }
      }}
    >
      <RadialSeparators count={count} style={radialSeparatorStyles} />
    </CircularProgressbarWithChildren>
  );
};
