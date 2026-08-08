//! `#[derive(Serdes)]` — teaches the serializer to write a struct into the resumable state.
//! Rust has no reflection, so the field list has to be emitted by something; this is that.

use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, Data, DeriveInput, Fields};

/// Writes each field as an object entry, in declaration order — object key order is observable in
/// the serialized state, so it follows the struct rather than anything sorted.
#[proc_macro_derive(Serdes)]
pub fn derive_serdes(input: TokenStream) -> TokenStream {
	let input = parse_macro_input!(input as DeriveInput);
	let name = &input.ident;
	let (impl_generics, type_generics, where_clause) = input.generics.split_for_impl();

	let Data::Struct(data) = &input.data else {
		return compile_error(name, "Serdes can only be derived for a struct");
	};
	let Fields::Named(fields) = &data.fields else {
		return compile_error(name, "Serdes needs named fields: the names become object keys");
	};

	let entries = fields.named.iter().map(|field| {
		let ident = field.ident.as_ref().expect("named field");
		let key = ident.to_string();
		quote! {
			(#key.to_string(), qwik::native::Serdes::into_serdes(self.#ident))
		}
	});

	quote! {
		impl #impl_generics qwik::native::Serdes for #name #type_generics #where_clause {
			fn into_serdes(self) -> ::std::rc::Rc<qwik::serdes::SerdesValue> {
				::std::rc::Rc::new(qwik::serdes::SerdesValue::Object(vec![#(#entries),*]))
			}
		}
	}
	.into()
}

fn compile_error(name: &syn::Ident, message: &str) -> TokenStream {
	syn::Error::new_spanned(name, message).to_compile_error().into()
}
