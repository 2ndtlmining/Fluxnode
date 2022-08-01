import React from 'react';
import './index.scss';
import { Helmet } from 'react-helmet';

function NotFoundView() {
  return (
    <div id='notfound-main'>
      <Helmet>
        <title>Not Found</title>
      </Helmet>

      <div className='notfound'>
        <div className='notfound-404'>
          <h1>404</h1>
        </div>
        <h2>Oops, the page you are looking for cannot be found!</h2>
        <a href='/'>
          <span className='arrow'></span>Return To Homepage
        </a>
      </div>
    </div>
  );
}

export default NotFoundView;
