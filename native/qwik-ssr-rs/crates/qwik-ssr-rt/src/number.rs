//! ECMAScript number formatting (specs/06). `to_js_string` is Number::toString(10);
//! `to_fixed` is Number.prototype.toFixed. Both byte-checked by Layer-0 goldens.

use num_bigint::BigUint;

pub fn to_js_string(value: f64) -> String {
	if value.is_nan() {
		return "NaN".to_string();
	}
	if value.is_infinite() {
		return if value > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
	}
	let mut buffer = ryu_js::Buffer::new();
	buffer.format(value).to_string()
}

pub fn to_fixed(value: f64, digits: u32) -> String {
	assert!(digits <= 100, "toFixed digits out of range");
	if value.is_nan() {
		return "NaN".to_string();
	}
	let (sign, x) = if value < 0.0 {
		("-", -value)
	} else {
		("", value)
	};
	if x >= 1e21 {
		return format!("{sign}{}", to_js_string(x));
	}

	// n = the integer closest to x * 10^digits, ties toward the larger n (ES spec).
	let bits = x.to_bits();
	let raw_exponent = ((bits >> 52) & 0x7ff) as i64;
	let raw_mantissa = bits & ((1u64 << 52) - 1);
	let (mantissa, exponent) = if raw_exponent == 0 {
		(raw_mantissa, -1074i64)
	} else {
		(raw_mantissa | (1u64 << 52), raw_exponent - 1075)
	};
	let scaled = BigUint::from(mantissa) * BigUint::from(10u32).pow(digits);
	let n = if exponent >= 0 {
		scaled << exponent as u64
	} else {
		let denominator = BigUint::from(1u32) << (-exponent) as u64;
		let quotient = &scaled / &denominator;
		let remainder = &scaled % &denominator;
		if remainder * 2u32 >= denominator {
			quotient + 1u32
		} else {
			quotient
		}
	};

	let mut m = n.to_string();
	if digits == 0 {
		return format!("{sign}{m}");
	}
	let width = digits as usize + 1;
	if m.len() < width {
		m = format!("{}{m}", "0".repeat(width - m.len()));
	}
	let point = m.len() - digits as usize;
	format!("{sign}{}.{}", &m[..point], &m[point..])
}
