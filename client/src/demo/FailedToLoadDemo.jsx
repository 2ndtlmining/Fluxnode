import React from 'react';
import './demo.scss';
import { Helmet } from 'react-helmet';

const FailedToLoadDemo = (props) => {
  return (
    <div id='notfound-main'>
      <Helmet>
        <title>Cannot Load Demo Wallet</title>
      </Helmet>

      <div className='notfound'>
        <div className='notfound-code'>
          <h1>{props.errorCode}</h1>
        </div>
        <h2>{props.errorMsg}</h2>
        <a href='/'>
          <span className='arrow'></span>Return To Homepage
        </a>
      </div>
    </div>
  );
}

export default FailedToLoadDemo;
