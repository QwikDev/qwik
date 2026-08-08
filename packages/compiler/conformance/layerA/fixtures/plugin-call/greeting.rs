qwik_ssr_rt::native_fn! {
	pub fn makeGreeting(name: String) -> String {
		format!("hello {name}")
	}
}
