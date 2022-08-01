import * as dayjs from 'dayjs';

import React from 'react';
import ReactDOM from 'react-dom/client';
import Application from './Application';
import 'styles/_lib.scss';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(Application, null));
