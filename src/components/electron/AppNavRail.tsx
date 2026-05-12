import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { APP_NAV_GROUPS, APP_NAV_ITEMS_BY_GROUP, isAppRouteActive } from '@/features/cockpit/navigation';
import lcLogo from '@/assets/logo-lc.jpeg';

export const AppNavRail = React.memo(function AppNavRail() {
  const location = useLocation();

  return (
    <nav style={railStyle} aria-label="Primary app navigation">
      <Link
        to="/station/hedge-fund"
        title="Hedge Fund Station"
        aria-label="Hedge Fund Station"
        style={brandButtonStyle}
      >
        <img src={lcLogo} alt="" aria-hidden="true" style={brandImageStyle} />
      </Link>

      <div style={navGroupsStyle}>
        {APP_NAV_GROUPS.map((group, groupIndex) => (
          <section key={group} aria-label={group} style={groupStyle}>
            {groupIndex > 0 ? <div style={separatorStyle} aria-hidden="true" /> : null}
            {APP_NAV_ITEMS_BY_GROUP[group].map((item) => {
              const isActive = isAppRouteActive(location.pathname, item.path);
              const Icon = item.icon;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={item.label}
                  aria-label={item.label}
                  data-app-nav-route={item.path}
                  style={{
                    ...navButtonStyle,
                    background: isActive ? 'rgba(255, 255, 255, 0.075)' : 'transparent',
                    color: isActive ? 'var(--app-text)' : 'var(--app-subtle)',
                    borderColor: isActive ? 'rgba(255, 255, 255, 0.11)' : 'transparent',
                    boxShadow: isActive ? '0 0 14px var(--app-glow)' : 'none'
                  }}
                >
                  <Icon size={17} strokeWidth={isActive ? 2.25 : 1.8} />
                </Link>
              );
            })}
          </section>
        ))}
      </div>
    </nav>
  );
});

const railStyle: React.CSSProperties = {
  width: '52px',
  height: '100%',
  flex: '0 0 52px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 6px',
  background: 'rgba(3, 7, 14, 0.82)',
  borderRight: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: 'inset -1px 0 0 rgba(0, 0, 0, 0.28)',
  overflow: 'hidden'
};

const brandButtonStyle: React.CSSProperties = {
  width: '38px',
  height: '30px',
  borderRadius: '7px',
  overflow: 'hidden',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  background: 'rgba(255, 255, 255, 0.04)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.36)',
  flex: '0 0 auto'
};

const brandImageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
  opacity: 0.92
};

const navGroupsStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  overflowY: 'auto',
  scrollbarWidth: 'none'
};

const groupStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '3px'
};

const separatorStyle: React.CSSProperties = {
  width: '22px',
  height: '1px',
  margin: '4px 0',
  background: 'rgba(255, 255, 255, 0.08)'
};

const navButtonStyle: React.CSSProperties = {
  width: '38px',
  height: '34px',
  borderRadius: '8px',
  border: '1px solid transparent',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
  transition: 'background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease',
  outlineOffset: '-2px',
  flex: '0 0 auto'
};
