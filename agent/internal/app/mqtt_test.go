package app

import (
	"errors"
	"testing"
)

type fakeMQTT struct {
	exists bool
	hasErr error
	addErr error
	added  int
	broker string
	port   int
}

func (f *fakeMQTT) HasIntegration(string) (bool, error) { return f.exists, f.hasErr }
func (f *fakeMQTT) AddMQTT(b string, p int) error {
	f.added++
	f.broker, f.port = b, p
	return f.addErr
}

func TestEnsureMQTT(t *testing.T) {
	f := &fakeMQTT{}
	ensureMQTT(f)
	if f.added != 1 || f.broker != "mosquitto" || f.port != 1883 {
		t.Errorf("ontbrekend: added=%d %s:%d", f.added, f.broker, f.port)
	}
	f = &fakeMQTT{exists: true}
	ensureMQTT(f)
	if f.added != 0 {
		t.Error("bestaande integratie mag niet opnieuw worden toegevoegd")
	}
	f = &fakeMQTT{hasErr: errors.New("x")}
	ensureMQTT(f)
	if f.added != 0 {
		t.Error("bij een leesfout niets toevoegen")
	}
	ensureMQTT(&fakeMQTT{addErr: errors.New("x")}) // mag niet paniekeren
}
