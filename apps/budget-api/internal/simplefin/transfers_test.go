package simplefin

import "testing"

func TestLooksLikeTransfer(t *testing.T) {
	yes := []string{
		"Xfer To *****0557",
		"Xfer From *****8879",
		"Transfer To Account XX7804",
		"Bob Smith - Ext Trans",
		"ONLINE TRANSFER FROM CHECKING",
		"Wire Transfer Out",
		"PAYMENT MADE BY ACCOUNT ENDING IN:3822",
		"Payment : Principal $35.59; Interest $0.00; Fees $0.00",
		"PAYMENT - THANK YOU",
		"AUTOMATIC PAYMENT",
		"Elan - Web Pymt",
		"ELAN - WEB PYMT",
	}
	no := []string{
		"ZELLE 7BA1IVKDD JULIA MAJOR",
		"Payment to Rocky Mountain Power",
		"SMITHS MRKTPL #4094",
		"Bank of America",
		"Verizon - Web Pymt",
		"Transportation Authority",
		"Transaction fee refund",
		"TRANSIT PASS",
	}
	for _, d := range yes {
		if !LooksLikeTransfer(d) {
			t.Errorf("%q should look like a transfer", d)
		}
	}
	for _, d := range no {
		if LooksLikeTransfer(d) {
			t.Errorf("%q should not look like a transfer", d)
		}
	}
}
