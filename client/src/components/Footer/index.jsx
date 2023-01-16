import React from 'react';
import './index.scss';

import { IconContext } from 'react-icons';

import { IoLogoTwitter, IoMailUnread, IoLogoYoutube, IoLogoGithub } from 'react-icons/io5';
import { BsGithub } from 'react-icons/bs';

import { URL_YOUTUBE, URL_TWITTER, URL_GITHUB, EMAIL, ADDRESS_FLUX, ADDRESS_BTC } from 'content/index';

import { IS_TEST_BUILD, IS_DEV, APP_VERSION } from 'app-buildinfo';

function _RenderAppVersion() {
  let suffix = '';
  if (IS_TEST_BUILD) suffix = '-test';
  else if (IS_DEV) suffix = '-dev';

  return `v${APP_VERSION}${suffix}`;
}

export function Footer() {
  return (
    <footer className='v-footer'>
      <div className='container-fluid px-5'>
        <div className='row pt-5 pb-2'>
          <div className='col-md-4 mb-md-0 mb-4'>
            <h2 className='footer-heading'>Follow Us</h2>
            <IconContext.Provider value={{ size: '20px', color: '#12cc94' }}>
              <ul className='links-list p-0'>
                <li>
                  <a href={URL_TWITTER} target='_blank'>
                    <IoLogoTwitter className='footer-logo' />
                  </a>
                </li>
                <li>
                  <a href={URL_YOUTUBE} target='_blank'>
                    <IoLogoYoutube className='footer-logo' />
                  </a>
                </li>
                <li>
                  <a href={'mailto:' + EMAIL} target='_blank'>
                    <IoMailUnread className='footer-logo' />
                  </a>
                </li>
                <li>
                  <a href={URL_GITHUB} target='_blank'>
                    <BsGithub className='footer-logo' />
                  </a>
                </li>
              </ul>
            </IconContext.Provider>
            <p>
              <span className='hl-app-version'>FluxNode {_RenderAppVersion()}</span>
            </p>
          </div>

          <div className='col-md-8 mb-md-0 mb-4'>
            <h2 className='footer-heading donation-heading'>Donations</h2>
            <p className='donation-info'>
              Donations are very much appreciated. Please consider donating to keep the website development going.
            </p>
            <ul className='donate-list p-0 ms-4'>
              <li>
                <span className='hl-addr-name'>Flux Address:&nbsp;</span>
                <span className='hl-addr-val'>{ADDRESS_FLUX}</span>
              </li>
              <li>
                <span className='hl-addr-name'>BTC Address:&nbsp;</span>
                <span className='hl-addr-val'>{ADDRESS_BTC}</span>
              </li>
            </ul>
          </div>

          <div className='col-12'>
            <div className='line mt-4'></div>
          </div>
        </div>

        <div className='row pt-3 pb-5'>
          <div className='col-12'>
            <p>Copyright ©&nbsp;2023 All rights reserved</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export const FooterRendered = <Footer />;
