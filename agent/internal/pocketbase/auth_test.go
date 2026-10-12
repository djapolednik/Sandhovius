package pocketbase

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func writeAuth(w http.ResponseWriter, token, house string) {
	json.NewEncoder(w).Encode(map[string]any{
		"token":  token,
		"record": map[string]string{"id": "box1", "serial": "SN-1", "house": house},
	})
}

func TestLoginAsBox(t *testing.T) {
	var gotAuthOnNext string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/collections/boxes/auth-with-password":
			var body map[string]string
			json.NewDecoder(r.Body).Decode(&body)
			if body["identity"] != "SN-1" || body["password"] != "geheim" {
				t.Errorf("body = %v", body)
			}
			writeAuth(w, "tok1", "house1")
		default:
			gotAuthOnNext = r.Header.Get("Authorization")
			w.Write([]byte("{}"))
		}
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	c.SetCredentials("SN-1", "geheim")
	rec, err := c.Login()
	if err != nil {
		t.Fatal(err)
	}
	if rec.House != "house1" || rec.Serial != "SN-1" || rec.ID != "box1" {
		t.Errorf("record = %+v", rec)
	}
	if err := c.do("GET", "/api/ping", nil, nil); err != nil {
		t.Fatal(err)
	}
	if gotAuthOnNext != "tok1" {
		t.Errorf("Authorization = %q, want tok1", gotAuthOnNext)
	}
}

func TestRefreshBoxReturnsHouse(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/collections/boxes/auth-with-password":
			writeAuth(w, "tok1", "")
		case "/api/collections/boxes/auth-refresh":
			if r.Method != "POST" {
				t.Errorf("method = %s", r.Method)
			}
			gotAuth = r.Header.Get("Authorization")
			writeAuth(w, "tok2", "house9")
		default:
			gotAuth = r.Header.Get("Authorization")
			w.Write([]byte("{}"))
		}
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	c.SetCredentials("SN-1", "geheim")
	if _, err := c.Login(); err != nil {
		t.Fatal(err)
	}
	rec, err := c.RefreshBox()
	if err != nil {
		t.Fatal(err)
	}
	if gotAuth != "tok1" {
		t.Errorf("refresh Authorization = %q, want tok1", gotAuth)
	}
	if rec.House != "house9" {
		t.Errorf("house = %q", rec.House)
	}
	if err := c.do("GET", "/api/ping", nil, nil); err != nil {
		t.Fatal(err)
	}
	if gotAuth != "tok2" {
		t.Errorf("Authorization after refresh = %q, want tok2", gotAuth)
	}
}

func TestRefreshBoxReloginsOn401(t *testing.T) {
	logins, refreshes := 0, 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/collections/boxes/auth-with-password":
			logins++
			writeAuth(w, "fresh", "house1")
		case "/api/collections/boxes/auth-refresh":
			refreshes++
			if refreshes == 1 {
				http.Error(w, `{"message":"expired"}`, 401)
				return
			}
			if r.Header.Get("Authorization") != "fresh" {
				t.Errorf("retry Authorization = %q", r.Header.Get("Authorization"))
			}
			writeAuth(w, "fresh2", "house1")
		}
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	c.SetCredentials("SN-1", "geheim")
	c.setToken("oud")
	rec, err := c.RefreshBox()
	if err != nil {
		t.Fatal(err)
	}
	if rec.House != "house1" || logins != 1 || refreshes != 2 {
		t.Errorf("house=%q logins=%d refreshes=%d", rec.House, logins, refreshes)
	}
}

func TestReportBoxSendsVersion(t *testing.T) {
	var path, auth, version string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, auth = r.URL.Path, r.Header.Get("Authorization")
		var body map[string]string
		json.NewDecoder(r.Body).Decode(&body)
		version = body["agent_version"]
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	c := NewClient(srv.URL)
	c.setToken("tok1")
	if err := c.ReportBox("v0.3.1-4-gabc1234"); err != nil {
		t.Fatal(err)
	}
	if path != "/api/sandhovius/box/report" || auth != "tok1" || version != "v0.3.1-4-gabc1234" {
		t.Errorf("path=%q auth=%q version=%q", path, auth, version)
	}
}
