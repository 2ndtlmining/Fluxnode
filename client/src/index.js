import * as dayjs from 'dayjs';

import React from 'react';
import ReactDOM from 'react-dom/client';
import Application from './Application';
import 'styles/_lib.scss';
import { BrowserRouter, HashRouter } from 'react-router-dom';



const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
    <HashRouter>
        <Application />
    </HashRouter>
);