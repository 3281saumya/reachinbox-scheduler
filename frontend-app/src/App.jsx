
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000";

function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [file, setFile] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [hourlyLimit, setHourlyLimit] = useState(100);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadUser();
    fetchCampaigns();
  }, []);

  async function loadUser() {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        credentials: "include",
      });
      const data = await response.json();
      setUser(data.user || null);
    } catch {
      setUser(null);
    }
  }

  function login() {
    window.location.href = `${API_URL}/auth/google`;
  }

  async function logout() {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
    await fetchCampaigns();
  }

  async function search() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const response = await fetch(
      `${API_URL}/search?q=${encodeURIComponent(searchQuery)}`,
      { credentials: "include" }
    );
    const data = await response.json();
    setSearchResults(data.results || []);
  }

  async function fetchCampaigns() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_URL}/campaigns`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch campaigns");
      }

      const data = await response.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function viewCampaign(campaignId) {
    try {
      setError("");
      setMessage("");

      const response = await fetch(
        `${API_URL}/campaigns/${campaignId}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch campaign details");
      }

      const data = await response.json();

      setSelectedCampaign(data.campaign);
      setStatistics(data.statistics);
    } catch (err) {
      setError(err.message);
    }
  }

  function closeDetails() {
    setSelectedCampaign(null);
    setStatistics(null);
    setError("");
  }

  function handleFileChange(event) {
    setFile(event.target.files[0] || null);
  }

  async function uploadCSV(event) {
    event.preventDefault();

    if (!file || !subject.trim() || !body.trim()) {
      setMessage("Please select a CSV file and fill all required fields.");
      return;
    }

    const formData = new FormData();

    formData.append("file", file);
    formData.append("subject", subject);
    formData.append("body", body);
    formData.append("delaySeconds", delaySeconds);
    formData.append("hourlyLimit", hourlyLimit);

    try {
      setUploading(true);
      setMessage("");
      setError("");

      const response = await fetch(`${API_URL}/upload-csv`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Upload failed");
      }

      setMessage(
        `Success! ${data.totalRecipients} recipients scheduled.`
      );

      setFile(null);
      setSubject("");
      setBody("");
      setDelaySeconds(0);
      setHourlyLimit(100);

      document.getElementById("csv-file").value = "";

      await fetchCampaigns();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <div>
            <h1>ReachInbox Scheduler</h1>
            <p>Email Campaign Management Dashboard</p>
          </div>
          {user ? (
            <div className="user-panel">
              {user.avatarUrl && <img src={user.avatarUrl} alt="" />}
              <span>{user.name || user.email}</span>
              <button onClick={logout}>Log out</button>
            </div>
          ) : (
            <button onClick={login}>Sign in with Google</button>
          )}
        </div>
      </header>

      <main>
        {selectedCampaign ? (
          <section>
            <button onClick={closeDetails}>
              ← Back to Campaigns
            </button>

            <div className="details-header">
              <h2>{selectedCampaign.name}</h2>
              <p>
                <strong>Subject:</strong>{" "}
                {selectedCampaign.subject}
              </p>
              <p>
                <strong>Status:</strong>{" "}
                <span
                  className={`status ${selectedCampaign.status.toLowerCase()}`}
                >
                  {selectedCampaign.status}
                </span>
              </p>
            </div>

            {statistics && (
              <div className="stats-grid">
                <div className="stat-card">
                  <h3>Total</h3>
                  <p>{statistics.total}</p>
                </div>

                <div className="stat-card sent">
                  <h3>Sent</h3>
                  <p>{statistics.sent}</p>
                </div>

                <div className="stat-card pending">
                  <h3>Pending</h3>
                  <p>{statistics.pending}</p>
                </div>

                <div className="stat-card processing">
                  <h3>Processing</h3>
                  <p>{statistics.processing}</p>
                </div>

                <div className="stat-card failed">
                  <h3>Failed</h3>
                  <p>{statistics.failed}</p>
                </div>
              </div>
            )}

            <h2>Recipients</h2>

            <div className="recipient-list">
              {selectedCampaign.recipients.map((recipient) => (
                <div className="recipient-card" key={recipient.id}>
                  <p>
                    <strong>Name:</strong>{" "}
                    {recipient.name || "N/A"}
                  </p>

                  <p>
                    <strong>Email:</strong>{" "}
                    {recipient.email}
                  </p>

                  <p>
                    <strong>Status:</strong>{" "}
                    <span
                      className={`status ${recipient.status.toLowerCase()}`}
                    >
                      {recipient.status}
                    </span>
                  </p>

                  <p>
                    <strong>Sent At:</strong>{" "}
                    {recipient.sentAt
                      ? new Date(
                          recipient.sentAt
                        ).toLocaleString()
                      : "Not sent"}
                  </p>
                </div>
              ))}
            </div>

            {error && <p className="error">{error}</p>}
          </section>
        ) : (
          <>
            <section className="upload-section">
              <h2>Create Campaign</h2>

              <form onSubmit={uploadCSV}>
                <label htmlFor="csv-file">CSV File</label>
                <input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                />

                <label htmlFor="subject">Email Subject</label>
                <input
                  id="subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject"
                />

                <label htmlFor="body">Email Body</label>
                <textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Enter email body"
                  rows="4"
                />

                <label htmlFor="delay">
                  Delay Between Emails (seconds)
                </label>
                <input
                  id="delay"
                  type="number"
                  min="0"
                  value={delaySeconds}
                  onChange={(e) =>
                    setDelaySeconds(e.target.value)
                  }
                />

                <label htmlFor="hourly-limit">
                  Hourly Email Limit
                </label>
                <input
                  id="hourly-limit"
                  type="number"
                  min="1"
                  value={hourlyLimit}
                  onChange={(e) =>
                    setHourlyLimit(e.target.value)
                  }
                />

                <button type="submit" disabled={uploading}>
                  {uploading
                    ? "Uploading..."
                    : "Upload & Schedule"}
                </button>
              </form>

              {message && (
                <p className="success">{message}</p>
              )}

              {error && <p className="error">{error}</p>}
            </section>

            <section>
              <div className="dashboard-header">
                <h2>Your Campaigns</h2>
                <div className="dashboard-actions">
                  <button onClick={fetchCampaigns}>Refresh</button>
                  <input
                    aria-label="Search campaigns and recipients"
                    placeholder="Search campaigns or recipients"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && search()}
                  />
                  <button onClick={search}>Search</button>
                </div>
              </div>

              {searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.map((result) => (
                    <div key={result.id}>
                      <strong>{result.entity === "campaign" ? result.name : result.email}</strong>
                      <span>{result.entity}</span>
                    </div>
                  ))}
                </div>
              )}

              {loading && <p>Loading campaigns...</p>}

              {error && !uploading && (
                <p className="error">{error}</p>
              )}

              {!loading &&
                !error &&
                campaigns.length === 0 && (
                  <p>No campaigns found.</p>
                )}

              <div className="campaign-grid">
                {campaigns.map((campaign) => (
                  <div
                    className="campaign-card"
                    key={campaign.id}
                  >
                    <h3>{campaign.name}</h3>

                    <p>
                      <strong>Subject:</strong>{" "}
                      {campaign.subject}
                    </p>

                    <p>
                      <strong>Status:</strong>{" "}
                      <span
                        className={`status ${campaign.status.toLowerCase()}`}
                      >
                        {campaign.status}
                      </span>
                    </p>

                    <p>
                      <strong>Recipients:</strong>{" "}
                      {campaign._count?.recipients || 0}
                    </p>

                    <p>
                      <strong>Hourly Limit:</strong>{" "}
                      {campaign.hourlyLimit}
                    </p>

                    <p>
                      <strong>Delay:</strong>{" "}
                      {campaign.delaySeconds} seconds
                    </p>

                    <button
                      onClick={() =>
                        viewCampaign(campaign.id)
                      }
                    >
                      View Details
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;