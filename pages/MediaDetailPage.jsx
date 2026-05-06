import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { fetchMovieDetails, fetchShowDetails, fetchSeasonDetails, fetchEpisodeDetails } from '../services/tmdb';
import { fetchGameDetails } from '../services/rawg';
import { fetchBookDetails } from '../services/openLibrary';
import RatingStars from '../components/RatingStars';
import ReviewInteractions from '../components/ReviewInteractions';
import './MediaDetailPage.css';

const TYPE_COLORS = {
  movie:   '#c9a84c',
  show:    '#60a5fa',
  season:  '#60a5fa',
  episode: '#60a5fa',
  book:    '#4ade80',
  game:    '#c084fc',
};

const ALL_RATING_VALUES = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];

function runtime(mins) {
  if (!mins) return null;
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

function formatMoney(n) {
  if (!n) return null;
  return '$' + (n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : (n / 1e6).toFixed(0) + 'M');
}

function episodeCode(season, episode) {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

export default function MediaDetailPage() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { user }   = useAuth();
  const baseMedia  = location.state?.media;

  const [details, setDetails]               = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [activity, setActivity]             = useState([]);
  const [userLog, setUserLog]               = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [avgRating, setAvgRating]           = useState(null);
  const [ratingCounts, setRatingCounts]     = useState({});

  useEffect(() => {
    if (!baseMedia) { navigate('/'); return; }
    setDetails(null);
    setActivity([]);
    setUserLog(null);
    setAvgRating(null);
    setRatingCounts({});
    fetchDetails();
    fetchActivity();
  }, [baseMedia?.external_id]);

  async function fetchDetails() {
    setLoadingDetails(true);
    try {
      let data = null;
      if      (baseMedia.media_type === 'movie')   data = await fetchMovieDetails(baseMedia.external_id);
      else if (baseMedia.media_type === 'show')    data = await fetchShowDetails(baseMedia.external_id);
      else if (baseMedia.media_type === 'season')  data = await fetchSeasonDetails(baseMedia.show_external_id, baseMedia.season_number);
      else if (baseMedia.media_type === 'episode') data = await fetchEpisodeDetails(baseMedia.show_external_id, baseMedia.season_number, baseMedia.episode_number);
      else if (baseMedia.media_type === 'game')    data = await fetchGameDetails(baseMedia.external_id);
      else if (baseMedia.media_type === 'book')    data = await fetchBookDetails(baseMedia.external_id);
      setDetails(data ? { ...baseMedia, ...data } : baseMedia);
    } catch {
      setDetails(baseMedia);
    } finally {
      setLoadingDetails(false);
    }
  }

  async function fetchActivity() {
    setLoadingActivity(true);
    try {
      let query = supabase
        .from('logs')
        .select('*, profiles(username, avatar_url)')
        .order('logged_at', { ascending: false });

      if (baseMedia.external_id) query = query.eq('external_id', baseMedia.external_id);
      else query = query.eq('title', baseMedia.title).eq('media_type', baseMedia.media_type);

      const { data } = await query;
      const logs = data || [];
      setActivity(logs);
      if (user) setUserLog(logs.find(l => l.user_id === user.id) || null);

      const rated = logs.filter(l => l.rating);
      if (rated.length) {
        setAvgRating((rated.reduce((s, l) => s + l.rating, 0) / rated.length).toFixed(1));
        const counts = {};
        ALL_RATING_VALUES.forEach(r => counts[r] = 0);
        rated.forEach(l => {
          const rounded = Math.round(l.rating * 2) / 2;
          if (counts[rounded] !== undefined) counts[rounded]++;
        });
        setRatingCounts(counts);
      }
    } catch (e) {
      console.error('fetchActivity error:', e);
    } finally {
      setLoadingActivity(false);
    }
  }

  if (!baseMedia) return null;

  const media     = details || baseMedia;
  const typeColor = TYPE_COLORS[media.media_type] || 'var(--accent)';
  const maxDist   = Math.max(...Object.values(ratingCounts), 1);

  const isMovie   = media.media_type === 'movie';
  const isShow    = media.media_type === 'show';
  const isSeason  = media.media_type === 'season';
  const isEpisode = media.media_type === 'episode';
  const isGame    = media.media_type === 'game';
  const isBook    = media.media_type === 'book';

  // Helper: build a season media object from a TMDB season entry + parent show context
  function buildSeasonMedia(season, showMedia) {
    return {
      title:            `${showMedia.title}: ${season.name}`,
      media_type:       'season',
      external_id:      `${showMedia.external_id}_s${season.season_number}`,
      show_external_id: showMedia.external_id,
      show_title:       showMedia.title,
      season_number:    season.season_number,
      cover_url:        season.poster_path
                          ? `https://image.tmdb.org/t/p/w342${season.poster_path}`
                          : showMedia.cover_url,
      year:             season.air_date ? season.air_date.split('-')[0] : showMedia.year,
      episode_count:    season.episode_count,
      overview:         season.overview,
      creator:          showMedia.creator || '',
      genre:            showMedia.genre   || '',
    };
  }

  // Helper: build an episode media object from a TMDB episode entry + season context
  function buildEpisodeMedia(ep, seasonMedia) {
    const showTitle  = seasonMedia.show_title || seasonMedia.title.split(':')[0].trim();
    const showExtId  = seasonMedia.show_external_id;
    const seasonNum  = seasonMedia.season_number;
    return {
      title:            `${showTitle}: ${ep.name}`,
      media_type:       'episode',
      external_id:      `${showExtId}_s${seasonNum}_e${ep.episode_number}`,
      show_external_id: showExtId,
      show_title:       showTitle,
      season_number:    seasonNum,
      episode_number:   ep.episode_number,
      cover_url:        ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
      backdrop_url:     ep.still_path ? `https://image.tmdb.org/t/p/w780${ep.still_path}` : null,
      year:             ep.air_date ? ep.air_date.split('-')[0] : seasonMedia.year,
      overview:         ep.overview,
      runtime:          ep.runtime,
      creator:          seasonMedia.creator || '',
      genre:            seasonMedia.genre   || '',
    };
  }

  return (
    <div className="detail-page">

      {/* BACKDROP */}
      <div className="detail-backdrop">
        {(media.backdrop_url || media.cover_url) && (
          <img src={media.backdrop_url || media.cover_url} alt="" className="backdrop-img" />
        )}
        <div className="backdrop-gradient" />
      </div>

      <button className="detail-back" onClick={() => navigate(-1)}>← Back</button>

      {/* HERO */}
      <div className="detail-hero">
        <div className={`detail-poster ${isEpisode ? 'detail-poster--wide' : ''}`}>
          {media.cover_url
            ? <img src={media.cover_url} alt={media.title} />
            : <div className="poster-placeholder" style={{ borderTop: `4px solid ${typeColor}` }}>{media.title?.[0]}</div>
          }
        </div>

        <div className="detail-meta">
          <div className="detail-badge-row">
            <span className="detail-type-badge" style={{ color: typeColor, borderColor: typeColor + '50' }}>
              {isSeason ? 'Season' : isEpisode ? 'Episode' : media.media_type}
            </span>
            {isEpisode && media.season_number && media.episode_number && (
              <span className="detail-episode-code" style={{ color: typeColor }}>
                {episodeCode(media.season_number, media.episode_number)}
              </span>
            )}
            {isSeason && media.season_number && (
              <span className="detail-episode-code" style={{ color: typeColor }}>
                Season {media.season_number}
              </span>
            )}
          </div>

          <h1 className="detail-title">{media.title}</h1>

          {media.tagline && <p className="detail-tagline">"{media.tagline}"</p>}

          <div className="detail-sub">
            {media.year && <span className="detail-year">{media.year}</span>}
            {isMovie  && media.runtime    && <><span className="detail-dot">·</span><span>{runtime(media.runtime)}</span></>}
            {isShow   && media.seasons    && <><span className="detail-dot">·</span><span>{media.seasons.length} season{media.seasons.length !== 1 ? 's' : ''}</span></>}
            {isShow   && media.episodes   && <><span className="detail-dot">·</span><span>{media.episodes} episodes</span></>}
            {isSeason && media.episodes?.length  && <><span className="detail-dot">·</span><span>{media.episodes.length} episodes</span></>}
            {isSeason && !media.episodes?.length && media.episode_count && <><span className="detail-dot">·</span><span>{media.episode_count} episodes</span></>}
            {isEpisode && media.runtime   && <><span className="detail-dot">·</span><span>{runtime(media.runtime)}</span></>}
            {isGame   && media.playtime   && <><span className="detail-dot">·</span><span>~{media.playtime}h avg playtime</span></>}
            {media.status                 && <><span className="detail-dot">·</span><span className="detail-status">{media.status}</span></>}
          </div>

          {/* Air date for seasons/episodes */}
          {(isSeason || isEpisode) && media.air_date && (
            <p className="detail-air-date">Aired {media.air_date}</p>
          )}

          {media.genres?.length > 0 && (
            <div className="detail-genres">
              {media.genres.map(g => (
                <span key={g} className="genre-tag" style={{ borderColor: typeColor + '40', color: typeColor }}>{g}</span>
              ))}
            </div>
          )}

          {/* Community rating */}
          <div className="detail-ratings-row">
            {avgRating && (
              <div className="detail-community-rating">
                <span className="avg-star">★</span>
                <span className="avg-num">{avgRating}</span>
                <span className="avg-sub">{activity.filter(l => l.rating).length} ratings</span>
              </div>
            )}
            {/* {isGame && media.metacritic && (
              <div className="detail-metacritic">
                <span className="meta-score" style={{ color: media.metacritic >= 75 ? '#4ade80' : media.metacritic >= 50 ? '#f59e0b' : '#f87171' }}>
                  {media.metacritic}
                </span>
                <span className="api-sub">Metacritic</span>
              </div>
            )} */}
          </div>

          {userLog && (
            <div className="detail-your-log">
              <span className="your-log-label">Your log:</span>
              <span className="your-log-status">{userLog.status.replace('_', ' ')}</span>
              {userLog.rating && (
                <span className="your-log-rating" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <RatingStars rating={userLog.rating} readOnly={true} size="sm" />
                </span>
              )}
            </div>
          )}

          <button className="detail-log-btn" onClick={() => navigate('/log', { state: { media: baseMedia } })}>
            {userLog ? '✎ Edit Log' : '+ Add to Log'}
          </button>
        </div>
      </div>

      {/* OVERVIEW */}
      {media.overview && (
        <section className="detail-section">
          <h2 className="detail-section-title">Overview</h2>
          <p className="detail-overview">{media.overview}</p>
        </section>
      )}

      {/* ── SEASONS (show page only) ── */}
      {isShow && media.seasons?.length > 0 && !loadingDetails && (
        <section className="detail-section">
          <h2 className="detail-section-title">
            Seasons
            <span className="detail-section-count">{media.seasons.filter(s => s.season_number > 0).length}</span>
          </h2>
          <div className="seasons-scroll-container">
            {media.seasons.filter(s => s.season_number > 0).map(season => {
              const seasonMedia = buildSeasonMedia(season, media);
              return (
                <div
                  key={season.id}
                  className="season-card fade-in"
                  onClick={() => navigate('/media', { state: { media: seasonMedia } })}
                >
                  <div className="season-poster">
                    {seasonMedia.cover_url
                      ? <img src={seasonMedia.cover_url} alt={season.name} loading="lazy" />
                      : <div className="poster-placeholder" style={{ borderTop: `4px solid ${typeColor}` }}>S</div>
                    }
                  </div>
                  <div className="season-info">
                    <h3 className="season-name">{season.name}</h3>
                    <p className="season-episodes">{season.episode_count} Episodes</p>
                    {season.air_date && <p className="season-year">{season.air_date.split('-')[0]}</p>}
                    {season.overview && (
                      <p className="season-overview" title={season.overview}>
                        {season.overview.length > 80 ? season.overview.slice(0, 80) + '...' : season.overview}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── EPISODES (season page only) ── */}
      {isSeason && !loadingDetails && (
        <section className="detail-section">
          <h2 className="detail-section-title">
            Episodes
            {media.episodes?.length > 0 && (
              <span className="detail-section-count">{media.episodes.length}</span>
            )}
          </h2>

          {loadingDetails ? (
            <div className="activity-loading"><div className="spinner" /></div>
          ) : media.episodes?.length > 0 ? (
            <div className="episodes-list">
              {media.episodes.map(ep => {
                const epMedia = buildEpisodeMedia(ep, media);
                return (
                  <div
                    key={ep.id ?? ep.episode_number}
                    className="episode-card"
                    onClick={() => navigate('/media', { state: { media: epMedia } })}
                  >
                    <div className="episode-still">
                      {ep.still_path
                        ? <img src={`https://image.tmdb.org/t/p/w300${ep.still_path}`} alt={ep.name} loading="lazy" />
                        : <div className="episode-still-placeholder">▶</div>
                      }
                    </div>
                    <div className="episode-info">
                      <div className="episode-header">
                        <span className="episode-code" style={{ color: typeColor }}>
                          {episodeCode(media.season_number, ep.episode_number)}
                        </span>
                        {ep.runtime && (
                          <span className="episode-runtime">{runtime(ep.runtime)}</span>
                        )}
                        {ep.air_date && (
                          <span className="episode-date">{ep.air_date}</span>
                        )}
                      </div>
                      <h3 className="episode-name">{ep.name}</h3>
                      {ep.overview && (
                        <p className="episode-overview">{ep.overview}</p>
                      )}
                    </div>
                    <button
                      className="episode-log-btn"
                      onClick={e => { e.stopPropagation(); navigate('/log', { state: { media: epMedia } }); }}
                      title="Log this episode"
                      style={{ borderColor: typeColor + '50', color: typeColor }}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="activity-empty"><p>No episode data available.</p></div>
          )}
        </section>
      )}

      {/* ── EPISODE: Guest Stars ── */}
      {isEpisode && media.guest_stars?.length > 0 && !loadingDetails && (
        <section className="detail-section">
          <h2 className="detail-section-title">
            Guest Stars
            <span className="detail-section-count">{media.guest_stars.length}</span>
          </h2>
          <div className="cast-grid">
            {media.guest_stars.map(person => (
              <div key={person.id} className="cast-card">
                <div className="cast-photo">
                  {person.profile_path
                    ? <img src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} alt={person.name} loading="lazy" />
                    : <div className="cast-photo-placeholder">{person.name?.[0]}</div>
                  }
                </div>
                <p className="cast-name">{person.name}</p>
                <p className="cast-character">{person.character}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── EPISODE: Crew ── */}
      {isEpisode && media.crew?.length > 0 && !loadingDetails && (
        <section className="detail-section">
          <h2 className="detail-section-title">Crew</h2>
          <div className="crew-list">
            {media.crew.map((c, i) => (
              <div key={i} className="crew-item">
                <span className="crew-role">{c.job}</span>
                <span className="crew-name">{c.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CAST & CREW — movies & shows */}
      {(isMovie || isShow) && !loadingDetails && (
        <>
          <section className="detail-section">
            <h2 className="detail-section-title">{isMovie ? 'Crew' : 'Created By'}</h2>
            <div className="crew-list">
              {isMovie && media.director && (
                <div className="crew-item">
                  <span className="crew-role">Director</span>
                  <span className="crew-name">{media.director}</span>
                </div>
              )}
              {isShow && media.creators?.map(c => (
                <div key={c} className="crew-item">
                  <span className="crew-role">Creator</span>
                  <span className="crew-name">{c}</span>
                </div>
              ))}
              {isMovie && media.writers?.map(w => (
                <div key={w} className="crew-item">
                  <span className="crew-role">Writer</span>
                  <span className="crew-name">{w}</span>
                </div>
              ))}
            </div>
          </section>

          {media.cast?.length > 0 && (
            <section className="detail-section">
              <h2 className="detail-section-title">Cast</h2>
              <div className="cast-grid">
                {media.cast.map(person => (
                  <div key={person.id} className="cast-card">
                    <div className="cast-photo">
                      {person.profile_path
                        ? <img src={`https://image.tmdb.org/t/p/w185${person.profile_path}`} alt={person.name} loading="lazy" />
                        : <div className="cast-photo-placeholder">{person.name?.[0]}</div>
                      }
                    </div>
                    <p className="cast-name">{person.name}</p>
                    <p className="cast-character">{person.character}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* AUTHORS — books */}
      {isBook && media.authors?.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-section-title">Author{media.authors.length > 1 ? 's' : ''}</h2>
          <div className="authors-list">
            {media.authors.map((a, i) => (
              <div key={i} className="author-card">
                {a.photo && <img src={a.photo} alt={a.name} className="author-photo" loading="lazy" />}
                <div className="author-info">
                  <p className="author-name">{a.name}</p>
                  {a.bio && <p className="author-bio">{a.bio.slice(0, 200)}{a.bio.length > 200 ? '…' : ''}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* GAME DEV / PUBLISHERS / PLATFORMS */}
      {isGame && !loadingDetails && (
        <section className="detail-section">
          <h2 className="detail-section-title">Details</h2>
          <div className="detail-facts">
            {media.developers?.length > 0 && (
              <div className="fact-row">
                <span className="fact-label">Developer</span>
                <span className="fact-value">{media.developers.join(', ')}</span>
              </div>
            )}
            {media.publishers?.length > 0 && (
              <div className="fact-row">
                <span className="fact-label">Publisher</span>
                <span className="fact-value">{media.publishers.join(', ')}</span>
              </div>
            )}
            {media.platforms?.length > 0 && (
              <div className="fact-row">
                <span className="fact-label">Platforms</span>
                <span className="fact-value">{media.platforms.join(', ')}</span>
              </div>
            )}
            {media.esrb && (
              <div className="fact-row">
                <span className="fact-label">ESRB</span>
                <span className="fact-value">{media.esrb}</span>
              </div>
            )}
            {media.release_date && (
              <div className="fact-row">
                <span className="fact-label">Released</span>
                <span className="fact-value">{media.release_date}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* MOVIE PRODUCTION DETAILS */}
      {isMovie && !loadingDetails && (media.production_companies?.length || media.budget || media.revenue || media.original_language) && (
        <section className="detail-section">
          <h2 className="detail-section-title">Production</h2>
          <div className="detail-facts">
            {media.release_date && (
              <div className="fact-row">
                <span className="fact-label">Release Date</span>
                <span className="fact-value">{media.release_date}</span>
              </div>
            )}
            {media.production_companies?.length > 0 && (
              <div className="fact-row">
                <span className="fact-label">Studio</span>
                <span className="fact-value">{media.production_companies.join(', ')}</span>
              </div>
            )}
            {media.budget > 0 && (
              <div className="fact-row">
                <span className="fact-label">Budget</span>
                <span className="fact-value">{formatMoney(media.budget)}</span>
              </div>
            )}
            {media.revenue > 0 && (
              <div className="fact-row">
                <span className="fact-label">Box Office</span>
                <span className="fact-value">{formatMoney(media.revenue)}</span>
              </div>
            )}
            {media.original_language && (
              <div className="fact-row">
                <span className="fact-label">Language</span>
                <span className="fact-value">{media.original_language.toUpperCase()}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SHOW NETWORK DETAILS */}
      {isShow && !loadingDetails && (media.networks?.length || media.first_air_date) && (
        <section className="detail-section">
          <h2 className="detail-section-title">Details</h2>
          <div className="detail-facts">
            {media.networks?.length > 0 && (
              <div className="fact-row">
                <span className="fact-label">Network</span>
                <span className="fact-value">{media.networks.join(', ')}</span>
              </div>
            )}
            {media.first_air_date && (
              <div className="fact-row">
                <span className="fact-label">First Aired</span>
                <span className="fact-value">{media.first_air_date}</span>
              </div>
            )}
            {media.last_air_date && media.last_air_date !== media.first_air_date && (
              <div className="fact-row">
                <span className="fact-label">Last Aired</span>
                <span className="fact-value">{media.last_air_date}</span>
              </div>
            )}
            {media.episode_runtime && (
              <div className="fact-row">
                <span className="fact-label">Episode Length</span>
                <span className="fact-value">{runtime(media.episode_runtime)}</span>
              </div>
            )}
            {media.original_language && (
              <div className="fact-row">
                <span className="fact-label">Language</span>
                <span className="fact-value">{media.original_language.toUpperCase()}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* SCREENSHOTS — games */}
      {isGame && media.screenshots?.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-section-title">Screenshots</h2>
          <div className="screenshots-grid">
            {media.screenshots.map((url, i) => (
              <img key={i} src={url} alt={`Screenshot ${i + 1}`} className="screenshot-img" loading="lazy" />
            ))}
          </div>
        </section>
      )}

      {/* KEYWORDS / THEMES */}
      {media.keywords?.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-section-title">Themes & Tags</h2>
          <div className="keywords-wrap">
            {media.keywords.map(k => (
              <span key={k} className="keyword-tag">{k}</span>
            ))}
          </div>
        </section>
      )}

      {/* BOOK SUBJECTS */}
      {isBook && media.subjects?.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-section-title">Subjects</h2>
          <div className="keywords-wrap">
            {media.subjects.map(s => (
              <span key={s} className="keyword-tag">{s}</span>
            ))}
          </div>
        </section>
      )}

      {/* RATING DISTRIBUTION */}
      {avgRating && (
        <section className="detail-section">
          <h2 className="detail-section-title">Community Ratings</h2>
          <div className="rating-dist">
            {ALL_RATING_VALUES.map(n => {
              const count = ratingCounts[n] || 0;
              return (
                <div key={n} className="dist-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.25rem' }}>
                  <div className="dist-label" style={{ width: '80px', display: 'flex', justifyContent: 'flex-end' }}>
                    <RatingStars rating={n} readOnly={true} size="sm" />
                  </div>
                  <div className="dist-bar-wrap" style={{ flex: 1, backgroundColor: 'var(--bg-lighter)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      className="dist-bar"
                      style={{ width: `${(count / maxDist) * 100}%`, background: typeColor, height: '100%', borderRadius: '4px' }}
                    />
                  </div>
                  <span className="dist-count" style={{ width: '20px', color: 'var(--text-muted)' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ACTIVITY */}
      <section className="detail-section">
        <h2 className="detail-section-title">
          Activity
          {activity.length > 0 && <span className="detail-section-count">{activity.length}</span>}
        </h2>

        {loadingActivity ? (
          <div className="activity-loading"><div className="spinner" /></div>
        ) : activity.length === 0 ? (
          <div className="activity-empty"><p>No one has logged this yet. Be the first!</p></div>
        ) : (
          <div className="activity-list">
            {activity.map(log => (
              <div key={log.id} className={`activity-item ${log.user_id === user?.id ? 'is-mine' : ''}`}>
                <div className="activity-avatar">
                  {log.profiles?.avatar_url
                    ? <img src={log.profiles.avatar_url} alt={log.profiles?.username} />
                    : <span>{log.profiles?.username?.[0]?.toUpperCase() || '?'}</span>
                  }
                </div>
                <div className="activity-body">
                  <div className="activity-top">
                    <span className="activity-username">
                      {log.profiles?.username || 'User'}
                      {log.user_id === user?.id && <span className="activity-you"> (you)</span>}
                    </span>
                    <span className="activity-status" style={{ color: typeColor }}>
                      {log.status.replace('_', ' ')}
                    </span>
                  </div>
                  {typeof log.rating === 'number' && (
                    <div className="activity-stars" style={{ display: 'inline-flex', marginTop: '0.25rem' }}>
                      <RatingStars rating={log.rating} readOnly={true} size="sm" />
                    </div>
                  )}
                  {log.review && <p className="activity-review">"{log.review}"</p>}
                  <span className="activity-date">
                    {new Date(log.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <ReviewInteractions log={log} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
