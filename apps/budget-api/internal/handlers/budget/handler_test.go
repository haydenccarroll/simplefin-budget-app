package budget

import "testing"

func TestValidClientID(t *testing.T) {
	cases := map[string]bool{
		"3f2b8c1e-9d4a-4c7b-8e21-0a1b2c3d4e5f": true,
		"3F2B8C1E-9D4A-4C7B-8E21-0A1B2C3D4E5F": true,
		"":                                     false,
		"not-a-uuid":                           false,
		"3f2b8c1e9d4a4c7b8e210a1b2c3d4e5f":     false, // no dashes
		"3f2b8c1e-9d4a-4c7b-8e21-0a1b2c3d4e5g": false, // not hex
	}
	for id, want := range cases {
		if got := validClientID(id); got != want {
			t.Errorf("validClientID(%q) = %v, want %v", id, got, want)
		}
	}
}
